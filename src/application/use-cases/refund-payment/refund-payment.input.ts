export interface RefundPaymentInput {
  paymentId: string;
  merchantId: string;
  userId: string;
  amount?: string;
  currency?: string;
  reason?: string;
}
