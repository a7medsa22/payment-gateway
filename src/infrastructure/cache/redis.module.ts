import {
  Module,
  Global,
  Injectable,
  Inject,
  OnApplicationShutdown,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { IdempotencyStore, REDIS_CLIENT } from './idempotency-store';

@Injectable()
export class RedisLifecycle implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisLifecycle.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    try {
      if (this.redis.status === 'ready' || this.redis.status === 'connecting') {
        await this.redis.quit();
      } else {
        this.redis.disconnect();
      }
    } catch (err: any) {
      this.logger.warn(`Error shutting down Redis: ${err.message}`);
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host =
          config.get<string>('redis.host') ||
          process.env.REDIS_HOST ||
          'localhost';
        const port =
          config.get<number>('redis.port') ||
          parseInt(process.env.REDIS_PORT || '6379', 10);
        const password =
          config.get<string>('redis.password') ||
          process.env.REDIS_PASSWORD ||
          undefined;

        const client = new Redis({
          host,
          port,
          password,
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
        });

        client.on('error', () => {
          // Suppress unhandled error crashes when Redis is offline
        });

        return client;
      },
    },
    RedisLifecycle,
    IdempotencyStore,
  ],
  exports: [REDIS_CLIENT, RedisLifecycle, IdempotencyStore],
})
export class RedisModule {}
