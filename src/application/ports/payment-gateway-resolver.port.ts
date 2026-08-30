import { PaymentProvider } from '@domain/enums';
import { PaymentGateway } from './payment-gateway.port';

export interface PaymentGatewayResolver {
  resolve(provider: PaymentProvider): PaymentGateway;
}
