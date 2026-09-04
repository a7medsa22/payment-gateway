import { PaymentRepository } from '@application/ports/payment.repository';
import { RefundPaymentInput } from './refund-payment.input';
import { RefundResultDto } from '@application/dtos/refund-result.dto';
import { PaymentNotFoundException } from '@domain/exceptions/domain.exception';
import { Money } from '@domain/value-objects/money.vo';
import { Currency } from '@domain/enums';
import { validateCurrency } from '@application/mappers/input.mapper';

export class RefundPaymentUseCase {
  constructor(private readonly paymentRepository: PaymentRepository) {}

  async execute(input: RefundPaymentInput): Promise<RefundResultDto> {
    const payment = await this.paymentRepository.findById(input.paymentId);

    if (!payment) {
      throw new PaymentNotFoundException(
        `Payment with ID ${input.paymentId} not found`,
      );
    }

    let refundAmount: Money | undefined;
    if (input.amount) {
      const currency = input.currency
        ? validateCurrency(input.currency)
        : payment.amount.currency;
      refundAmount = Money.from(input.amount, currency as Currency);
    }

    // Execute domain business logic (invariants checked inside aggregate)
    payment.refund(refundAmount, input.reason);

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
