import { Module } from '@nestjs/common';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { PaymentRepository } from './ports/payment.repository';
import { PaymentGatewayResolver } from './ports/payment-gateway-resolver.port';
import { CreatePaymentUseCase } from './use-cases/create-payment/create-payment.use-case';
import { RefundPaymentUseCase } from './use-cases/refund-payment/refund-payment.use-case';
import { GetPaymentUseCase } from './use-cases/get-payment/get-payment.use-case';
import { StubPaymentGatewayResolver } from '@infrastructure/gateways/stub-payment-gateway-resolver';

@Module({
  imports: [PersistenceModule],
  providers: [
    StubPaymentGatewayResolver,
    {
      provide: 'PaymentGatewayResolver',
      useExisting: StubPaymentGatewayResolver,
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
  ],
})
export class PaymentModule {}
