import { Logger } from '@nestjs/common';
import { PaymentRepository } from '@application/ports/payment.repository';
import { WebhookEventRepository } from '@application/ports/webhook-event.repository';
import { ProviderWebhookEvent } from '@application/ports/provider-webhook-event';
import { PaymentStatus, FailureReason } from '@domain/enums';
import { Money } from '@domain/value-objects/money.vo';
import { withConcurrencyRetry } from '@application/utils/with-concurrency-retry';
import { Payment } from '@domain/aggregates/payment.aggregate';

export class HandlePaymentWebhookUseCase {
  private readonly logger = new Logger(HandlePaymentWebhookUseCase.name);

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly webhookEventRepository: WebhookEventRepository,
  ) {}

  async execute(
    provider: string,
    event: ProviderWebhookEvent,
  ): Promise<string> {
    switch (event.kind) {
      case 'payment.succeeded':
        return this.handlePaymentSucceeded(provider, event);
      case 'payment.failed':
        return this.handlePaymentFailed(provider, event);
      case 'payment.canceled':
        return this.handlePaymentCanceled(provider, event);
      case 'refund.succeeded':
        return this.handleRefundSucceeded(provider, event);
      case 'refund.failed':
        return this.handleRefundFailed(provider, event);
      case 'dispute.created':
        return this.handleDisputeCreated(provider, event);
      case 'ignored':
      default:
        await this.webhookEventRepository.markProcessed(provider, event.eventId);
        return 'ignored';
    }
  }

  private async handlePaymentSucceeded(
    provider: string,
    event: Extract<ProviderWebhookEvent, { kind: 'payment.succeeded' }>,
  ): Promise<string> {
    const initialPayment = await this.findPayment(
      event.paymentId,
      event.providerPaymentId,
    );

    if (!initialPayment) {
      this.logger.warn(
        `No payment found for provider payment ${event.providerPaymentId}`,
      );
      await this.webhookEventRepository.markProcessed(provider, event.eventId);
      return 'payment_not_found';
    }

    const amountOk =
      event.amountMinor === initialPayment.amount.toSmallestUnit() &&
      event.currency.toLowerCase() === initialPayment.amount.currency.toLowerCase();
    const intentOk =
      !initialPayment.providerPaymentId ||
      initialPayment.providerPaymentId === event.providerPaymentId;

    if (!amountOk || !intentOk) {
      this.logger.error(
        `[ALERT] PAYMENT_MISMATCH payment=${initialPayment.id} intent=${event.providerPaymentId} ` +
          `expected=${initialPayment.amount.toSmallestUnit()} ${initialPayment.amount.currency} ` +
          `got=${event.amountMinor} ${event.currency}`,
      );
      await this.webhookEventRepository.markRequiresReview(
        provider,
        event.eventId,
        'amount_or_intent_mismatch',
      );
      return 'requires_review';
    }

    if (
      [
        PaymentStatus.FAILED,
        PaymentStatus.EXPIRED,
        PaymentStatus.CANCELLED,
      ].includes(initialPayment.status)
    ) {
      this.logger.error(
        `[ALERT] CHARGE_ON_TERMINAL_PAYMENT payment=${initialPayment.id} status=${initialPayment.status} intent=${event.providerPaymentId}`,
      );
      await this.webhookEventRepository.markRequiresReview(
        provider,
        event.eventId,
        `succeeded_on_${initialPayment.status}`,
      );
      return 'requires_review';
    }

    if (initialPayment.status === PaymentStatus.SUCCEEDED) {
      this.logger.log(
        `Payment ${initialPayment.id} is already in SUCCEEDED state. No-op.`,
      );
      await this.webhookEventRepository.markProcessed(provider, event.eventId);
      return 'already_succeeded';
    }

    await withConcurrencyRetry(async () => {
      const payment = await this.findPayment(
        event.paymentId,
        event.providerPaymentId,
      );
      if (!payment || payment.status === PaymentStatus.SUCCEEDED) return;

      if (payment.status === PaymentStatus.CREATED) {
        payment.start();
      }

      if (
        payment.status === PaymentStatus.PENDING ||
        payment.status === PaymentStatus.PROCESSING
      ) {
        payment.succeed(event.providerPaymentId);
        await this.paymentRepository.save(payment);
      }
    });

    await this.webhookEventRepository.markProcessed(provider, event.eventId);
    return 'succeeded';
  }

  private async handlePaymentFailed(
    provider: string,
    event: Extract<ProviderWebhookEvent, { kind: 'payment.failed' }>,
  ): Promise<string> {
    const initialPayment = await this.findPayment(
      event.paymentId,
      event.providerPaymentId,
    );

    if (!initialPayment) {
      this.logger.warn(
        `No payment found for provider payment ${event.providerPaymentId}`,
      );
      await this.webhookEventRepository.markProcessed(provider, event.eventId);
      return 'payment_not_found';
    }

    if (
      initialPayment.status === PaymentStatus.FAILED ||
      initialPayment.status === PaymentStatus.CANCELLED ||
      initialPayment.status === PaymentStatus.EXPIRED
    ) {
      this.logger.log(
        `Payment ${initialPayment.id} is already in terminal failed state (${initialPayment.status}). No-op.`,
      );
      await this.webhookEventRepository.markProcessed(provider, event.eventId);
      return 'already_failed';
    }

    await withConcurrencyRetry(async () => {
      const payment = await this.findPayment(
        event.paymentId,
        event.providerPaymentId,
      );
      if (!payment) return;

      if (payment.status === PaymentStatus.CREATED) {
        payment.start();
      }

      if (
        payment.status === PaymentStatus.PENDING ||
        payment.status === PaymentStatus.PROCESSING
      ) {
        payment.fail(event.errorCode, FailureReason.PROVIDER_ERROR);
        await this.paymentRepository.save(payment);
      }
    });

    await this.webhookEventRepository.markProcessed(provider, event.eventId);
    return 'failed';
  }

  private async handlePaymentCanceled(
    provider: string,
    event: Extract<ProviderWebhookEvent, { kind: 'payment.canceled' }>,
  ): Promise<string> {
    const initialPayment = await this.findPayment(
      event.paymentId,
      event.providerPaymentId,
    );

    if (!initialPayment) {
      this.logger.warn(
        `No payment found for provider payment ${event.providerPaymentId}`,
      );
      await this.webhookEventRepository.markProcessed(provider, event.eventId);
      return 'payment_not_found';
    }

    if (initialPayment.status === PaymentStatus.CANCELLED) {
      await this.webhookEventRepository.markProcessed(provider, event.eventId);
      return 'already_canceled';
    }

    await withConcurrencyRetry(async () => {
      const payment = await this.findPayment(
        event.paymentId,
        event.providerPaymentId,
      );
      if (!payment || payment.status === PaymentStatus.CANCELLED) return;

      payment.cancel('canceled_by_provider', FailureReason.PROVIDER_ERROR);
      await this.paymentRepository.save(payment);
    });

    await this.webhookEventRepository.markProcessed(provider, event.eventId);
    return 'canceled';
  }

  private async handleRefundSucceeded(
    provider: string,
    event: Extract<ProviderWebhookEvent, { kind: 'refund.succeeded' }>,
  ): Promise<string> {
    const initialPayment = await this.paymentRepository.findByProviderPaymentId(
      event.providerPaymentId,
    );

    if (!initialPayment) {
      this.logger.warn(
        `No payment found for provider payment ${event.providerPaymentId} on refund`,
      );
      await this.webhookEventRepository.markProcessed(provider, event.eventId);
      return 'payment_not_found';
    }

    await withConcurrencyRetry(async () => {
      const payment = await this.paymentRepository.findByProviderPaymentId(
        event.providerPaymentId,
      );
      if (!payment) return;

      if (event.refundTxId) {
        payment.confirmRefund(event.refundTxId, event.providerRefundId);
      } else {
        const refundMoney = Money.fromSmallestUnit(
          event.amountMinor,
          payment.amount.currency,
        );
        payment.recordExternalRefund(refundMoney, event.providerRefundId);
      }

      await this.paymentRepository.save(payment);
    });

    await this.webhookEventRepository.markProcessed(provider, event.eventId);
    return 'refund_succeeded';
  }

  private async handleRefundFailed(
    provider: string,
    event: Extract<ProviderWebhookEvent, { kind: 'refund.failed' }>,
  ): Promise<string> {
    const initialPayment = await this.paymentRepository.findByProviderPaymentId(
      event.providerPaymentId,
    );

    if (!initialPayment) {
      this.logger.warn(
        `No payment found for provider payment ${event.providerPaymentId} on failed refund`,
      );
      await this.webhookEventRepository.markProcessed(provider, event.eventId);
      return 'payment_not_found';
    }

    if (event.refundTxId) {
      await withConcurrencyRetry(async () => {
        const payment = await this.paymentRepository.findByProviderPaymentId(
          event.providerPaymentId,
        );
        if (!payment) return;
        payment.failRefund(event.refundTxId!);
        await this.paymentRepository.save(payment);
      });
    }

    await this.webhookEventRepository.markProcessed(provider, event.eventId);
    return 'refund_failed';
  }

  private async handleDisputeCreated(
    provider: string,
    event: Extract<ProviderWebhookEvent, { kind: 'dispute.created' }>,
  ): Promise<string> {
    this.logger.error(
      `[ALERT] DISPUTE payment=${event.providerPaymentId} amount=${event.amountMinor} reason=${event.reason}`,
    );
    await this.webhookEventRepository.markRequiresReview(
      provider,
      event.eventId,
      'dispute_created',
    );
    return 'requires_review';
  }

  private async findPayment(
    paymentId?: string,
    providerPaymentId?: string,
  ): Promise<Payment | null> {
    if (paymentId) {
      const payment = await this.paymentRepository.findById(paymentId);
      if (payment) return payment;
    }
    if (providerPaymentId) {
      return this.paymentRepository.findByProviderPaymentId(providerPaymentId);
    }
    return null;
  }
}
