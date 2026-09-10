import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import databaseConfig from './config/database.config';
import providersConfig from './config/providers.config';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { PaymentModule } from './application/payment.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, providersConfig],
    }),
    PersistenceModule,
    PaymentModule,
  ],
})
export class AppModule {}
