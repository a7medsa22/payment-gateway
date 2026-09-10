import { PaymentGatewayResolverImpl } from './payment-gateway-resolver.impl';
import { PaymentGateway } from '@application/ports/payment-gateway.port';
import { PaymentProvider } from '@domain/enums';
import { DomainException } from '@domain/exceptions/domain.exception';

describe('PaymentGatewayResolverImpl', () => {
  let resolver: PaymentGatewayResolverImpl;
  let mockStripeGateway: jest.Mocked<PaymentGateway>;

  beforeEach(() => {
    mockStripeGateway = {
      createPayment: jest.fn(),
    };
    resolver = new PaymentGatewayResolverImpl(mockStripeGateway);
  });

  it('should resolve StripePaymentGateway for STRIPE provider', () => {
    const gateway = resolver.resolve(PaymentProvider.STRIPE);
    expect(gateway).toBe(mockStripeGateway);
  });

  it('should throw DomainException for PAYMOB provider', () => {
    expect(() => resolver.resolve(PaymentProvider.PAYMOB)).toThrow(
      DomainException,
    );
    expect(() => resolver.resolve(PaymentProvider.PAYMOB)).toThrow(
      'Unsupported payment provider: paymob',
    );
  });

  it('should throw DomainException for unknown provider', () => {
    expect(() => resolver.resolve('unknown' as PaymentProvider)).toThrow(
      DomainException,
    );
    expect(() => resolver.resolve('unknown' as PaymentProvider)).toThrow(
      'Unsupported payment provider: unknown',
    );
  });
});
