import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeySchema } from '../schemas/api-key.schema';
import { createHash, randomBytes } from 'crypto';

export interface MerchantContext {
  merchantId: string;
  merchantName: string;
  scopes: string[];
}

@Injectable()
export class ApiKeyRepository {
  constructor(
    @InjectRepository(ApiKeySchema)
    private readonly repo: Repository<ApiKeySchema>,
  ) {}

  async findByKey(rawKey: string): Promise<MerchantContext | null> {
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const record = await this.repo.findOne({
      where: { keyHash, status: 'active' },
    });

    if (!record) return null;

    // Update last_used_at asynchronously (fire-and-forget, non-blocking)
    this.repo.update(record.id, { lastUsedAt: new Date() }).catch(() => {});

    return {
      merchantId: record.merchantId,
      merchantName: record.merchantName,
      scopes: record.scopes,
    };
  }

  async createKey(params: {
    merchantId: string;
    merchantName: string;
    scopes?: string[];
  }): Promise<{ secretKey: string }> {
    const rawKey = `sk_live_${this.generateSecureRandom(32)}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 12);

    const entity = this.repo.create({
      merchantId: params.merchantId,
      merchantName: params.merchantName,
      keyHash,
      keyPrefix,
      status: 'active',
      scopes: params.scopes ?? [
        'payments:create',
        'payments:read',
        'payments:refund',
      ],
    });

    await this.repo.save(entity);

    // Return the raw key ONCE — it cannot be retrieved again
    return { secretKey: rawKey };
  }

  private generateSecureRandom(length: number): string {
    return randomBytes(length).toString('hex');
  }
}
