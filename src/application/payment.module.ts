import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { PaymentRepository } from './ports/payment.repository';
import { PaymentGatewayResolver } from './ports/payment-gateway-resolver.port';
import { CreatePaymentUseCase } from './use-cases/create-payment/create-payment.use-case';
import { RefundPaymentUseCase } from './use-cases/refund-payment/refund-payment.use-case';
import { GetPaymentUseCase } from './use-cases/get-payment/get-payment.use-case';
import { HandlePaymentWebhookUseCase } from './use-cases/handle-payment-webhook/handle-payment-webhook.use-case';
import { WebhookEventRepository } from './ports/webhook-event.repository';
import { StripePaymentGateway } from '@infrastructure/gateways/stripe-payment-gateway';
import { PaymentGatewayResolverImpl } from '@infrastructure/gateways/payment-gateway-resolver.impl';
import {
  stripeClientProvider,
  STRIPE_CLIENT,
} from '@infrastructure/gateways/stripe-client.provider';
import Stripe from 'stripe';

@Module({
  imports: [PersistenceModule],
  providers: [
    stripeClientProvider,
    {
      provide: 'StripePaymentGateway',
      useFactory: (stripe: Stripe) => new StripePaymentGateway(stripe),
      inject: [STRIPE_CLIENT],
    },
    PaymentGatewayResolverImpl,
    {
      provide: 'PaymentGatewayResolver',
      useExisting: PaymentGatewayResolverImpl,
    },
    {
      provide: CreatePaymentUseCase,
      useFactory: (
        paymentRepo: PaymentRepository,
        gatewayResolver: PaymentGatewayResolver,
      ) => new CreatePaymentUseCase(paymentRepo, gatewayResolver),
      inject: ['PaymentRepository', 'PaymentGatewayResolver'],
    },
    {
      provide: RefundPaymentUseCase,
      useFactory: (
        paymentRepo: PaymentRepository,
        gatewayResolver: PaymentGatewayResolver,
      ) => new RefundPaymentUseCase(paymentRepo, gatewayResolver),
      inject: ['PaymentRepository', 'PaymentGatewayResolver'],
    },
    {
      provide: GetPaymentUseCase,
      useFactory: (paymentRepo: PaymentRepository) =>
        new GetPaymentUseCase(paymentRepo),
      inject: ['PaymentRepository'],
    },
    {
      provide: HandlePaymentWebhookUseCase,
      useFactory: (
        paymentRepo: PaymentRepository,
        webhookEventRepo: WebhookEventRepository,
      ) => new HandlePaymentWebhookUseCase(paymentRepo, webhookEventRepo),
      inject: ['PaymentRepository', 'WebhookEventRepository'],
    },
  ],
  exports: [
    CreatePaymentUseCase,
    RefundPaymentUseCase,
    GetPaymentUseCase,
    HandlePaymentWebhookUseCase,
    'PaymentGatewayResolver',
    'StripePaymentGateway',
    STRIPE_CLIENT,
  ],
})
export class PaymentModule {}
