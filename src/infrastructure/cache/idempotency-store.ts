import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import * as crypto from 'crypto';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export interface IdempotencyRecord {
  status: 'IN_FLIGHT' | 'DONE';
  bodyHash: string;
  statusCode?: number;
  body?: unknown;
}

@Injectable()
export class IdempotencyStore {
  private readonly logger = new Logger(IdempotencyStore.name);
  private readonly keyPrefix = 'idempotency:';

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Hashes the path and request body for deterministic replay validation.
   */
  hashBody(payload: { path: string; body: unknown }): string {
    const raw = JSON.stringify(payload);
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Tries to acquire the idempotency lock.
   * Returns null if acquired (new request), or existing IdempotencyRecord if already in-flight or done.
   * If Redis is down, fails open (returns null).
   */
  async tryAcquire(
    merchantId: string,
    key: string,
    bodyHash: string,
  ): Promise<IdempotencyRecord | null> {
    const redisKey = this.getKey(merchantId, key);

    try {
      const initialRecord: IdempotencyRecord = {
        status: 'IN_FLIGHT',
        bodyHash,
      };

      // 60 second in-flight lock TTL
      const acquired = await this.redis.set(
        redisKey,
        JSON.stringify(initialRecord),
        'EX',
        60,
        'NX',
      );

      if (acquired === 'OK') {
        return null;
      }

      const existingRaw = await this.redis.get(redisKey);
      if (!existingRaw) {
        return null;
      }

      return JSON.parse(existingRaw) as IdempotencyRecord;
    } catch (err: any) {
      this.logger.warn(
        `Redis unavailable during tryAcquire for key ${key}: ${err.message}. Failing open to DB.`,
      );
      return null;
    }
  }

  /**
   * Marks the idempotent operation as completed and caches the HTTP response.
   */
  async complete(
    merchantId: string,
    key: string,
    bodyHash: string,
    statusCode: number,
    body: unknown,
  ): Promise<void> {
    const redisKey = this.getKey(merchantId, key);

    try {
      const record: IdempotencyRecord = {
        status: 'DONE',
        bodyHash,
        statusCode,
        body,
      };

      // 24 hour retention for completed responses
      await this.redis.set(redisKey, JSON.stringify(record), 'EX', 86400);
    } catch (err: any) {
      this.logger.warn(
        `Redis unavailable during complete for key ${key}: ${err.message}`,
      );
    }
  }

  /**
   * Releases an in-flight lock on error so retries can proceed.
   */
  async release(merchantId: string, key: string): Promise<void> {
    const redisKey = this.getKey(merchantId, key);

    try {
      await this.redis.del(redisKey);
    } catch (err: any) {
      this.logger.warn(
        `Redis unavailable during release for key ${key}: ${err.message}`,
      );
    }
  }

  private getKey(merchantId: string, key: string): string {
    return `${this.keyPrefix}${merchantId}:${key}`;
  }
}
