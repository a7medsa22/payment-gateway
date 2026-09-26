import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PaymentModule } from '@application/payment.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { AuthInfrastructureModule } from '@infrastructure/auth/auth-infrastructure.module';
import { PaymentController } from './controllers/payment.controller';
import { StripeWebhookController } from './controllers/stripe-webhook.controller';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
import { ApiKeyGuard } from './guards/api-key.guard';
import { ScopeGuard } from './guards/scope.guard';

@Module({
  imports: [PaymentModule, PersistenceModule, AuthInfrastructureModule],
  controllers: [PaymentController, StripeWebhookController],
  providers: [
    ApiKeyGuard,
    ScopeGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
  ],
})
export class PresentationModule {}
