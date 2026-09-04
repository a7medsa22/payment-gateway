import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PaymentSchema } from './typeorm/schemas/payment.schema';
import { TransactionSchema } from './typeorm/schemas/transaction.schema';
import { TypeOrmPaymentRepository } from './typeorm/repositories/typeorm-payment.repository';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...config.get('database'),
        entities: [PaymentSchema, TransactionSchema],
      }),
    }),
    TypeOrmModule.forFeature([PaymentSchema, TransactionSchema]),
  ],
  providers: [
    TypeOrmPaymentRepository,
    {
      provide: 'PaymentRepository',
      useExisting: TypeOrmPaymentRepository,
    },
  ],
  exports: ['PaymentRepository', TypeOrmPaymentRepository, TypeOrmModule],
})
export class PersistenceModule {}
