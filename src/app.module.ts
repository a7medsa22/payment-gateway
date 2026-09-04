import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import databaseConfig from './config/database.config';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { PaymentModule } from './application/payment.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
    }),
    PersistenceModule,
    PaymentModule,
  ],
})
export class AppModule {}
