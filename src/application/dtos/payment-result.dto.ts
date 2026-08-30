export interface PaymentResultDto {
  id: string;
  userId: string;
  amount: string;
  currency: string;
  status: string;
  provider: string;
  providerPaymentId?: string;
  clientSecret?: string;
  createdAt: Date;
}
