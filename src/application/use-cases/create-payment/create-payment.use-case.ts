import { CreatePaymentInput } from './create-payment.input';
import { PaymentRepository } from '@application/ports/payment.repository';
import { PaymentGatewayResolver } from '@application/ports/payment-gateway-resolver.port';
import { Money } from '@domain/value-objects/money.vo';
import { FailureReason, PaymentStatus } from '@domain/enums';
import { Payment } from '@domain/aggregates/payment.aggregate';
import { PaymentResultDto } from '@application/dtos/payment-result.dto';
import { PaymentGatewayException } from '@application/exceptions/payment-gateway.exception';
import {
  DuplicateIdempotencyKeyException,
  IdempotencyKeyMismatchException,
} from '@application/exceptions/duplicate-idempotency-key.exception';
import { ConcurrencyException } from '@domain/exceptions/domain.exception';
import {
  validateCurrency,
  validateProvider,
} from '@application/mappers/input.mapper';

export class CreatePaymentUseCase {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly gatewayResolver: PaymentGatewayResolver,
  ) {}

  async execute(input: CreatePaymentInput): Promise<PaymentResultDto> {
    if (input.idempotencyKey) {
      const existing = await this.paymentRepository.findByIdempotencyKey(
        input.merchantId,
        input.idempotencyKey,
      );
      if (existing) {
        return this.replay(existing, input);
      }
    }

    // 1. Validate & map primitives -> domain types
    const currency = validateCurrency(input.currency);
    const provider = validateProvider(input.provider);
    const money = Money.from(input.amount, currency);
    money.assertCurrencyPrecision();

    // 2. Create Payment aggregate
    const id = crypto.randomUUID();
    const payment = Payment.create({
      id,
      merchantId: input.merchantId,
      userId: input.userId,
      amount: money,
      provider,
      idempotencyKey: input.idempotencyKey,
      description: input.description,
    });

    // 3. Start payment process (CREATED -> PENDING)
    payment.start();

    // 4. PERSIST FIRST: Save record to DB before invoking external gateway
    try {
      await this.paymentRepository.save(payment);
    } catch (e) {
      if (
        e instanceof DuplicateIdempotencyKeyException &&
        input.idempotencyKey
      ) {
        const winner = await this.paymentRepository.findByIdempotencyKey(
          input.merchantId,
          input.idempotencyKey,
        );
        return this.replay(winner!, input);
      }
      throw e;
    }

    return this.executeGateway(payment);
  }

  private async replay(
    existing: Payment,
    input: CreatePaymentInput,
  ): Promise<PaymentResultDto> {
    // Same key + different request → 422
    if (
      existing.userId !== input.userId ||
      !existing.amount.equals(
        Money.from(input.amount, validateCurrency(input.currency)),
      ) ||
      existing.provider !== validateProvider(input.provider)
    ) {
      throw new IdempotencyKeyMismatchException(
        'Idempotency-Key reused with different parameters',
      );
    }

    // Previous attempt crashed or got an ambiguous error → safe to retry:
    // Stripe key `create:${payment.id}` returns the SAME PaymentIntent
    if (
      existing.status === PaymentStatus.PENDING &&
      !existing.providerPaymentId
    ) {
      return this.executeGateway(existing);
    }

    const gw = this.gatewayResolver.resolve(existing.provider);
    let details;
    if (existing.providerPaymentId && typeof gw?.retrievePayment === 'function') {
      try {
        details = await gw.retrievePayment(existing.providerPaymentId);
      } catch {
        // Safe fallback if provider retrieve fails
      }
    }

    return this.toDto(
      existing,
      existing.providerPaymentId,
      details?.clientSecret,
    );
  }

  private async executeGateway(payment: Payment): Promise<PaymentResultDto> {
    const gateway = this.gatewayResolver.resolve(payment.provider);
    let gatewayResult;
    try {
      gatewayResult = await gateway.createPayment({
        paymentId: payment.id,
        idempotencyKey: `create:${payment.id}`,
        amount: payment.amount.toSmallestUnit(),
        currency: payment.amount.currency,
        description: payment.description,
      });
    } catch (error) {
      if (error instanceof PaymentGatewayException && !error.ambiguous) {
        payment.fail('provider_rejected', FailureReason.PROVIDER_ERROR);
        try {
          await this.paymentRepository.save(payment);
        } catch (saveError) {
          throw new AggregateError(
            [error, saveError],
            'Gateway rejected payment and FAILED state could not be persisted',
          );
        }
      }
      // ambiguous → payment stays PENDING. Resolved by an idempotent retry or by reconciliation.
      throw error;
    }

    try {
      if (gatewayResult.status === 'succeeded') {
        payment.succeed(gatewayResult.providerPaymentId);
        await this.paymentRepository.save(payment);
      } else if (gatewayResult.status === 'failed') {
        payment.fail('provider_rejected', FailureReason.PROVIDER_ERROR);
        await this.paymentRepository.save(payment);
      } else if (gatewayResult.status === 'pending') {
        if (gatewayResult.providerPaymentId) {
          payment.setProviderPaymentId(gatewayResult.providerPaymentId);
        }
        await this.paymentRepository.save(payment);
      }
    } catch (saveError) {
      if (saveError instanceof ConcurrencyException) {
        const fresh = await this.paymentRepository.findById(payment.id);
        if (fresh) {
          return this.toDto(
            fresh,
            fresh.providerPaymentId,
            gatewayResult.clientSecret,
          );
        }
      }
      throw saveError;
    }

    return this.toDto(
      payment,
      gatewayResult.providerPaymentId,
      gatewayResult.clientSecret,
    );
  }

  private toDto(
    payment: Payment,
    providerPaymentId?: string,
    clientSecret?: string,
  ): PaymentResultDto {
    return {
      id: payment.id,
      merchantId: payment.merchantId,
      userId: payment.userId,
      amount: payment.amount.amount,
      currency: payment.amount.currency,
      status: payment.status,
      provider: payment.provider,
      providerPaymentId: providerPaymentId ?? payment.providerPaymentId,
      clientSecret,
      createdAt: payment.createdAt,
    };
  }
}