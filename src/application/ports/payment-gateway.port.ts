import { Currency } from '@domain/enums';

export interface CreatePaymentGatewayRequest {
  paymentId: string;
  amount: number;
  currency: Currency;
  description?: string;
}

export interface CreatePaymentGatewayResult {
  providerPaymentId: string;
  status: 'pending' | 'succeeded' | 'failed';
  clientSecret?: string;
}

export interface PaymentGateway {
  createPayment(
    request: CreatePaymentGatewayRequest,
  ): Promise<CreatePaymentGatewayResult>;
}
