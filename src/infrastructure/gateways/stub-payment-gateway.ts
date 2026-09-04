import {
  PaymentGateway,
  CreatePaymentGatewayRequest,
  CreatePaymentGatewayResult,
} from '@application/ports/payment-gateway.port';

export class StubPaymentGateway implements PaymentGateway {
  constructor(private readonly providerName: string = 'stub') {}

  async createPayment(
    request: CreatePaymentGatewayRequest,
  ): Promise<CreatePaymentGatewayResult> {
    return {
      providerPaymentId: `${this.providerName}_pi_${request.paymentId}`,
      status: 'pending',
      clientSecret: `${this.providerName}_secret_${request.paymentId}`,
    };
  }
}
