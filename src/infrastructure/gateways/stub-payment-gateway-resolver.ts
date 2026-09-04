import { Injectable } from '@nestjs/common';
import { PaymentGatewayResolver } from '@application/ports/payment-gateway-resolver.port';
import { PaymentGateway } from '@application/ports/payment-gateway.port';
import { PaymentProvider } from '@domain/enums';
import { StubPaymentGateway } from './stub-payment-gateway';

@Injectable()
export class StubPaymentGatewayResolver implements PaymentGatewayResolver {
  private readonly gateways = new Map<PaymentProvider, PaymentGateway>();

  constructor() {
    this.gateways.set(
      PaymentProvider.STRIPE,
      new StubPaymentGateway('stripe'),
    );
    this.gateways.set(
      PaymentProvider.PAYMOB,
      new StubPaymentGateway('paymob'),
    );
  }

  resolve(provider: PaymentProvider): PaymentGateway {
    const gateway = this.gateways.get(provider);
    if (!gateway) {
      return new StubPaymentGateway(provider);
    }
    return gateway;
  }
}
