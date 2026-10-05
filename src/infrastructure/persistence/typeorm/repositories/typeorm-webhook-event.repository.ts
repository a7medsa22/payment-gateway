import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ClaimResult,
  WebhookEventRecord,
  WebhookEventRepository,
  WebhookEventStatus,
} from '@application/ports/webhook-event.repository';
import { WebhookEventSchema } from '../schemas/webhook-event.schema';

@Injectable()
export class TypeOrmWebhookEventRepository implements WebhookEventRepository {
  constructor(
    @InjectRepository(WebhookEventSchema)
    private readonly webhookEventRepo: Repository<WebhookEventSchema>,
  ) {}

  async claim(event: WebhookEventRecord): Promise<ClaimResult> {
    const inserted = await this.webhookEventRepo
      .createQueryBuilder()
      .insert()
      .into(WebhookEventSchema)
      .values({
        id: event.id,
        eventId: event.eventId,
        provider: event.provider,
        eventType: event.eventType,
        status: WebhookEventStatus.RECEIVED,
        payload: event.payload as any,
      })
      .orIgnore()
      .returning('id')
      .execute();

    if (inserted.raw.length > 0) return 'new';

    const existing = await this.webhookEventRepo.findOneByOrFail({
      provider: event.provider,
      eventId: event.eventId,
    });
    const done = [
      WebhookEventStatus.PROCESSED,
      WebhookEventStatus.IGNORED,
      WebhookEventStatus.REQUIRES_REVIEW,
    ] as string[];
    return done.includes(existing.status) ? 'processed' : 'retry';
  }

  async markProcessed(provider: string, eventId: string): Promise<void> {
    await this.webhookEventRepo.update(
      { provider, eventId },
      {
        status: WebhookEventStatus.PROCESSED,
        processedAt: new Date(),
      },
    );
  }

  async markFailed(
    provider: string,
    eventId: string,
    error: string,
  ): Promise<void> {
    await this.webhookEventRepo.update(
      { provider, eventId },
      {
        status: WebhookEventStatus.FAILED,
        lastError: error.slice(0, 1000),
        attempts: () => 'attempts + 1',
      },
    );
  }

  async markRequiresReview(
    provider: string,
    eventId: string,
    reason: string,
  ): Promise<void> {
    await this.webhookEventRepo.update(
      { provider, eventId },
      {
        status: WebhookEventStatus.REQUIRES_REVIEW,
        lastError: reason.slice(0, 1000),
      },
    );
  }
}
