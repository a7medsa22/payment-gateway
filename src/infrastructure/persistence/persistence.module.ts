import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PaymentSchema } from './typeorm/schemas/payment.schema';
import { TransactionSchema } from './typeorm/schemas/transaction.schema';
import { WebhookEventSchema } from './typeorm/schemas/webhook-event.schema';
import { ApiKeySchema } from '../auth/schemas/api-key.schema';
import { TypeOrmPaymentRepository } from './typeorm/repositories/typeorm-payment.repository';
import { TypeOrmWebhookEventRepository } from './typeorm/repositories/typeorm-webhook-event.repository';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...config.get('database'),
        entities: [
          PaymentSchema,
          TransactionSchema,
          WebhookEventSchema,
          ApiKeySchema,
        ],
      }),
    }),
    TypeOrmModule.forFeature([
      PaymentSchema,
      TransactionSchema,
      WebhookEventSchema,
    ]),
  ],
  providers: [
    TypeOrmPaymentRepository,
    {
      provide: 'PaymentRepository',
      useExisting: TypeOrmPaymentRepository,
    },
    TypeOrmWebhookEventRepository,
    {
      provide: 'WebhookEventRepository',
      useExisting: TypeOrmWebhookEventRepository,
    },
  ],
  exports: [
    'PaymentRepository',
    TypeOrmPaymentRepository,
    'WebhookEventRepository',
    TypeOrmWebhookEventRepository,
    TypeOrmModule,
  ],
})
export class PersistenceModule {}
