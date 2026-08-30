import { CreatePaymentInput } from './create-payment.input';
import { PaymentRepository } from '@application/ports/payment.repository';
import { PaymentGatewayResolver } from '@application/ports/payment-gateway-resolver.port';
import { Money } from '@domain/value-objects/money.vo';
import { FailureReason } from '@domain/enums';
import { Payment } from '@domain/aggregates/payment.aggregate';
import { PaymentResultDto } from '@application/dtos/payment-result.dto';
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
    // 1. Validate & map primitives -> domain types
    const currency = validateCurrency(input.currency);
    const provider = validateProvider(input.provider);
    const money = Money.from(input.amount, currency);

    // 2. Create Payment aggregate
    const id = crypto.randomUUID();
    const payment = Payment.create({
      id,
      userId: input.userId,
      amount: money,
      provider,
      description: input.description,
    });

    // 3. Start payment process (CREATED -> PENDING)
    payment.start();

    // 4. Resolve gateway and perform external side-effect
    const gateway = this.gatewayResolver.resolve(provider);
    const gatewayResult = await gateway.createPayment({
      paymentId: id,
      amount: money.toCents(),
      currency,
      description: input.description,
    });

    // 5. Apply domain state transition based on gateway result
    if (gatewayResult.status === 'succeeded') {
      payment.succeed(gatewayResult.providerPaymentId);
    } else if (gatewayResult.status === 'failed') {
      payment.fail('provider_rejected', FailureReason.PROVIDER_ERROR);
    }

    // 6. Persist Payment aggregate
    await this.paymentRepository.save(payment);

    // 7. Return application DTO
    return {
      id: payment.id,
      userId: payment.userId,
      amount: payment.amount.amount,
      currency: payment.amount.currency,
      status: payment.status,
      provider: payment.provider,
      providerPaymentId: gatewayResult.providerPaymentId,
      clientSecret: gatewayResult.clientSecret,
      createdAt: payment.createdAt,
    };
  }
}