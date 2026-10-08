import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import databaseConfig from './config/database.config';
import providersConfig from './config/providers.config';
import redisConfig from './config/redis.config';
import { RedisModule } from './infrastructure/cache/redis.module';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { PaymentModule } from './application/payment.module';
import { PresentationModule } from './presentation/presentation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, providersConfig, redisConfig],
    }),
    RedisModule,
    PersistenceModule,
    PaymentModule,
    PresentationModule,
  ],
})
export class AppModule {}
