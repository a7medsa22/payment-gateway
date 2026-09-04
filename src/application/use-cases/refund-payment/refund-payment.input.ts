export interface RefundPaymentInput {
  paymentId: string;
  amount?: string;
  currency?: string;
  reason?: string;
}
