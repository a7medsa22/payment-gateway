import { PaymentRepository } from '@application/ports/payment.repository';
import { PaymentGatewayResolver } from '@application/ports/payment-gateway-resolver.port';
import { RefundPaymentInput } from './refund-payment.input';
import { RefundResultDto } from '@application/dtos/refund-result.dto';
import {
  DomainException,
  PaymentException,
  PaymentNotFoundException,
} from '@domain/exceptions/domain.exception';
import { ForbiddenAccessException } from '@domain/exceptions/forbidden-access.exception';
import { Money } from '@domain/value-objects/money.vo';
import { Currency, PaymentStatus } from '@domain/enums';
import { validateCurrency } from '@application/mappers/input.mapper';

export class RefundPaymentUseCase {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly gatewayResolver: PaymentGatewayResolver,
  ) {}

  async execute(input: RefundPaymentInput): Promise<RefundResultDto> {
    const payment = await this.paymentRepository.findById(input.paymentId);

    if (!payment) {
      throw new PaymentNotFoundException(
        `Payment with ID ${input.paymentId} not found`,
      );
    }

    if (payment.merchantId !== input.merchantId) {
      throw new ForbiddenAccessException(
        'You do not have permission to refund this payment',
      );
    }

    let refundAmount: Money | undefined;
    if (input.amount) {
      const currency = input.currency
        ? validateCurrency(input.currency)
        : payment.amount.currency;
      refundAmount = Money.from(input.amount, currency as Currency);
    }

    // Validate domain preconditions before executing external financial side effect
    if (
      payment.status !== PaymentStatus.SUCCEEDED &&
      payment.status !== PaymentStatus.PARTIALLY_REFUNDED
    ) {
      throw new PaymentException(
        `Cannot refund payment from status: ${payment.status}`,
      );
    }

    const effectiveAmount = refundAmount ?? payment.refundableAmount;

    if (effectiveAmount.isZero() || !effectiveAmount.isPositive()) {
      throw new DomainException('Refund amount must be positive');
    }

    if (effectiveAmount.currency !== payment.amount.currency) {
      throw new DomainException(
        `Refund currency mismatch: expected ${payment.amount.currency}, got ${effectiveAmount.currency}`,
      );
    }

    if (effectiveAmount.isGreaterThan(payment.refundableAmount)) {
      throw new DomainException(
        `Refund amount (${effectiveAmount.amount}) exceeds refundable amount (${payment.refundableAmount.amount})`,
      );
    }

    if (!payment.providerPaymentId) {
      throw new PaymentException(
        'Cannot refund payment without provider payment ID',
      );
    }

    // Call external gateway to process the refund
    const gateway = this.gatewayResolver.resolve(payment.provider);
    const gatewayResult = await gateway.refundPayment({
      paymentId: payment.id,
      providerPaymentId: payment.providerPaymentId,
      amount: effectiveAmount.toSmallestUnit(),
      reason: input.reason,
    });

    if (gatewayResult.status === 'failed') {
      throw new PaymentException('Payment provider rejected refund');
    }

    // Execute domain business logic (state transition & child transaction)
    payment.refund(refundAmount, input.reason, gatewayResult.providerRefundId);

    // Persist changes
    await this.paymentRepository.save(payment);

    // Get the latest refund transaction
    const refundTransactions = payment.transactions.filter((t) =>
      t.isRefund(),
    );
    const lastRefundTx =
      refundTransactions[refundTransactions.length - 1];

    return {
      paymentId: payment.id,
      status: payment.status,
      amount: payment.amount.amount,
      currency: payment.amount.currency,
      totalRefunded: payment.totalRefunded.amount,
      refundableAmount: payment.refundableAmount.amount,
      refundedAt: payment.refundedAt,
      refundTransactionId: lastRefundTx?.id,
      reason: input.reason,
    };
  }
}
