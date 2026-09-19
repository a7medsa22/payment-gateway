export interface RefundPaymentInput {
  paymentId: string;
  userId: string;
  amount?: string;
  currency?: string;
  reason?: string;
}
