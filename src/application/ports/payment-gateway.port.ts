import { Currency } from '@domain/enums';

export interface CreatePaymentGatewayRequest {
  paymentId: string;
  idempotencyKey: string;
  amount: number;
  currency: Currency;
  description?: string;
}

export interface CreatePaymentGatewayResult {
  providerPaymentId: string;
  status: 'pending' | 'succeeded' | 'failed';
  clientSecret?: string;
}

export interface RefundPaymentGatewayRequest {
  paymentId: string;
  refundTxId: string;
  providerPaymentId: string;
  amount: number;
  currency: Currency;
  reason?: string;
}

export interface RefundPaymentGatewayResult {
  providerRefundId: string;
  status: 'pending' | 'succeeded' | 'failed';
}

export interface RetrievedPaymentDetails {
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  amount: number;
  currency: string;
  clientSecret?: string;
}

export interface PaymentGateway {
  createPayment(
    request: CreatePaymentGatewayRequest,
  ): Promise<CreatePaymentGatewayResult>;
  refundPayment(
    request: RefundPaymentGatewayRequest,
  ): Promise<RefundPaymentGatewayResult>;
  retrievePayment(
    providerPaymentId: string,
  ): Promise<RetrievedPaymentDetails>;
}
