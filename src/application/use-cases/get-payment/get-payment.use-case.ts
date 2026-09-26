import { PaymentRepository } from '@application/ports/payment.repository';
import { PaymentDetailDto } from '@application/dtos/payment-detail.dto';
import { PaymentNotFoundException } from '@domain/exceptions/domain.exception';
import { ForbiddenAccessException } from '@domain/exceptions/forbidden-access.exception';

export class GetPaymentUseCase {
  constructor(private readonly paymentRepository: PaymentRepository) {}

  async execute(paymentId: string, merchantId: string): Promise<PaymentDetailDto> {
    const payment = await this.paymentRepository.findById(paymentId);

    if (!payment) {
      throw new PaymentNotFoundException(
        `Payment with ID ${paymentId} not found`,
      );
    }

    if (payment.merchantId !== merchantId) {
      throw new ForbiddenAccessException(
        'You do not have permission to access this payment',
      );
    }

    return {
      id: payment.id,
      merchantId: payment.merchantId,
      userId: payment.userId,
      amount: payment.amount.amount,
      currency: payment.amount.currency,
      status: payment.status,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      paymentMethodType: payment.paymentMethodType,
      description: payment.description,
      errorCode: payment.errorCode,
      failureReason: payment.failureReason,
      totalCharged: payment.totalCharged.amount,
      totalRefunded: payment.totalRefunded.amount,
      refundableAmount: payment.refundableAmount.amount,
      transactions: payment.transactions.map((tx) => ({
        id: tx.id,
        paymentId: tx.paymentId,
        type: tx.type,
        status: tx.status,
        amount: tx.amount.amount,
        currency: tx.amount.currency,
        provider: tx.provider,
        providerTransactionId: tx.providerTransactionId,
        description: tx.description,
        metadata: tx.metadata,
        processedAt: tx.processedAt,
        createdAt: tx.createdAt,
      })),
      succeededAt: payment.succeededAt,
      failedAt: payment.failedAt,
      refundedAt: payment.refundedAt,
      cancelledAt: payment.cancelledAt,
      expiredAt: payment.expiredAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }
}
