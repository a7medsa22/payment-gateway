export interface CreatePaymentInput {
  merchantId: string;
  userId: string;
  amount: string;
  currency: string;
  provider: string;
  description?: string;
}