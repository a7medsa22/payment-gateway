import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { PaymentRepository } from './ports/payment.repository';
import { PaymentGatewayResolver } from './ports/payment-gateway-resolver.port';
import { CreatePaymentUseCase } from './use-cases/create-payment/create-payment.use-case';
import { RefundPaymentUseCase } from './use-cases/refund-payment/refund-payment.use-case';
import { GetPaymentUseCase } from './use-cases/get-payment/get-payment.use-case';
import { StripePaymentGateway } from '@infrastructure/gateways/stripe-payment-gateway';
import { PaymentGatewayResolverImpl } from '@infrastructure/gateways/payment-gateway-resolver.impl';

@Module({
  imports: [PersistenceModule],
  providers: [
    {
      provide: 'StripePaymentGateway',
      useFactory: (configService: ConfigService) => {
        const secretKey =
          configService.get<string>('providers.stripe.secretKey') || '';
        const apiVersion = configService.get<string>(
          'providers.stripe.apiVersion',
        );
        return new StripePaymentGateway(secretKey, apiVersion);
      },
      inject: [ConfigService],
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
      useFactory: (paymentRepo: PaymentRepository) =>
        new RefundPaymentUseCase(paymentRepo),
      inject: ['PaymentRepository'],
    },
    {
      provide: GetPaymentUseCase,
      useFactory: (paymentRepo: PaymentRepository) =>
        new GetPaymentUseCase(paymentRepo),
      inject: ['PaymentRepository'],
    },
  ],
  exports: [
    CreatePaymentUseCase,
    RefundPaymentUseCase,
    GetPaymentUseCase,
    'PaymentGatewayResolver',
    'StripePaymentGateway',
  ],
})
export class PaymentModule {}
