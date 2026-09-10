import { Injectable, Inject } from '@nestjs/common';
import { PaymentGatewayResolver } from '@application/ports/payment-gateway-resolver.port';
import { PaymentGateway } from '@application/ports/payment-gateway.port';
import { PaymentProvider } from '@domain/enums';
import { DomainException } from '@domain/exceptions/domain.exception';

@Injectable()
export class PaymentGatewayResolverImpl implements PaymentGatewayResolver {
  private readonly gateways = new Map<PaymentProvider, PaymentGateway>();

  constructor(
    @Inject('StripePaymentGateway')
    private readonly stripeGateway: PaymentGateway,
  ) {
    this.gateways.set(PaymentProvider.STRIPE, this.stripeGateway);
  }

  resolve(provider: PaymentProvider): PaymentGateway {
    const gateway = this.gateways.get(provider);
    if (!gateway) {
      throw new DomainException(`Unsupported payment provider: ${provider}`);
    }
    return gateway;
  }
}
