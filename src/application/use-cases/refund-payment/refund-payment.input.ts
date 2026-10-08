export interface RefundPaymentInput {
  paymentId: string;
  merchantId: string;
  userId: string;
  idempotencyKey?: string;
  amount?: string;
  currency?: string;
  reason?: string;
}
