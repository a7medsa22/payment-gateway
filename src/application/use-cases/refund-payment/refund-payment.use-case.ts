import { PaymentRepository } from '@application/ports/payment.repository';
import { PaymentGatewayResolver } from '@application/ports/payment-gateway-resolver.port';
import { RefundPaymentInput } from './refund-payment.input';
import { RefundResultDto } from '@application/dtos/refund-result.dto';
import {
  PaymentException,
  PaymentNotFoundException,
} from '@domain/exceptions/domain.exception';
import { Money } from '@domain/value-objects/money.vo';
import { validateCurrency } from '@application/mappers/input.mapper';
import { withConcurrencyRetry } from '@application/utils/with-concurrency-retry';
import { PaymentGatewayException } from '@application/exceptions/payment-gateway.exception';
import { RefundPaymentGatewayResult } from '@application/ports/payment-gateway.port';
import { Payment } from '@domain/aggregates/payment.aggregate';

export class RefundPaymentUseCase {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly gatewayResolver: PaymentGatewayResolver,
  ) {}

  async execute(input: RefundPaymentInput): Promise<RefundResultDto> {
    // ── 1. RESERVE (short write, protected by optimistic version) ──────────
    const { payment, refundTx } = await withConcurrencyRetry(async () => {
      const p = await this.loadOwned(input.paymentId, input.merchantId);
      const amount = input.amount
        ? Money.from(input.amount, validateCurrency(input.currency ?? p.amount.currency))
        : undefined;
      const tx = p.requestRefund(amount, input.reason, input.idempotencyKey);
      await this.paymentRepository.save(p); // concurrent reservers → retry → re-validated
      return { payment: p, refundTx: tx };
    });

    if (refundTx.isSuccessful()) {
      return this.toDto(payment, refundTx.id, input.reason, 'succeeded');
    }
    if (refundTx.isFailed()) {
      throw new PaymentException('Payment provider rejected refund');
    }
    if (refundTx.isPending() && refundTx.providerTransactionId) {
      return this.toDto(payment, refundTx.id, input.reason, 'pending');
    }

    // ── 2. EXECUTE at provider (idempotent via refundTx.id) ────────────────
    const gateway = this.gatewayResolver.resolve(payment.provider);
    let result: RefundPaymentGatewayResult;
    try {
      result = await gateway.refundPayment({
        paymentId: payment.id,
        refundTxId: refundTx.id,
        providerPaymentId: payment.providerPaymentId!,
        amount: refundTx.amount.toSmallestUnit(),
        currency: payment.amount.currency,
        reason: input.reason,
      });
    } catch (error) {
      if (error instanceof PaymentGatewayException && !error.ambiguous) {
        await this.applyToFresh(payment.id, (p) => p.failRefund(refundTx.id));
      }
      // ambiguous → stays PENDING; reconciliation job (Stage 4) settles it
      throw error;
    }

    // ── 3. CONFIRM ─────────────────────────────────────────────────────────
    const final = await this.applyToFresh(payment.id, (p) => {
      if (result.status === 'succeeded') {
        p.confirmRefund(refundTx.id, result.providerRefundId);
      } else if (result.status === 'pending') {
        p.markRefundPending(refundTx.id, result.providerRefundId);
      } else {
        p.failRefund(refundTx.id);
      }
    });

    if (result.status === 'failed') {
      throw new PaymentException('Payment provider rejected refund');
    }

    return this.toDto(
      final,
      refundTx.id,
      input.reason,
      result.status as 'succeeded' | 'pending',
    );
  }

  /** Cross-tenant safe: same 404 whether missing or owned by another merchant (M3). */
  private async loadOwned(paymentId: string, merchantId: string): Promise<Payment> {
    const p = await this.paymentRepository.findById(paymentId);
    if (!p || p.merchantId !== merchantId) {
      throw new PaymentNotFoundException(`Payment with ID ${paymentId} not found`);
    }
    return p;
  }

  /** Reload → mutate → save, retrying on version conflicts (e.g. a webhook raced us). */
  private applyToFresh(id: string, mutate: (p: Payment) => void): Promise<Payment> {
    return withConcurrencyRetry(async () => {
      const p = (await this.paymentRepository.findById(id))!;
      mutate(p);
      await this.paymentRepository.save(p);
      return p;
    });
  }

  private toDto(
    payment: Payment,
    refundTxId: string,
    reason?: string,
    refundStatus: 'succeeded' | 'pending' = 'succeeded',
  ): RefundResultDto {
    return {
      paymentId: payment.id,
      status: payment.status,
      amount: payment.amount.amount,
      currency: payment.amount.currency,
      totalRefunded: payment.totalRefunded.amount,
      refundableAmount: payment.refundableAmount.amount,
      refundedAt: payment.refundedAt,
      refundTransactionId: refundTxId,
      refundStatus,
      reason,
    };
  }
}
