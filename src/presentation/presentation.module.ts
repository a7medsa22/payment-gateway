import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PaymentModule } from '@application/payment.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { PaymentController } from './controllers/payment.controller';
import { StripeWebhookController } from './controllers/stripe-webhook.controller';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';

@Module({
  imports: [PaymentModule, PersistenceModule],
  controllers: [PaymentController, StripeWebhookController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
  ],
})
export class PresentationModule {}
