export type ProviderWebhookEvent =
  | {
      kind: 'payment.succeeded';
      eventId: string;
      paymentId?: string;
      providerPaymentId: string;
      amountMinor: number;
      currency: string;
    }
  | {
      kind: 'payment.failed';
      eventId: string;
      paymentId?: string;
      providerPaymentId: string;
      errorCode: string;
    }
  | {
      kind: 'payment.canceled';
      eventId: string;
      paymentId?: string;
      providerPaymentId: string;
    }
  | {
      kind: 'refund.succeeded';
      eventId: string;
      providerPaymentId: string;
      providerRefundId: string;
      refundTxId?: string;
      amountMinor: number;
    }
  | {
      kind: 'refund.failed';
      eventId: string;
      providerPaymentId: string;
      providerRefundId: string;
      refundTxId?: string;
    }
  | {
      kind: 'dispute.created';
      eventId: string;
      providerPaymentId: string;
      amountMinor: number;
      reason: string;
    }
  | {
      kind: 'ignored';
      eventId: string;
      type: string;
    };
