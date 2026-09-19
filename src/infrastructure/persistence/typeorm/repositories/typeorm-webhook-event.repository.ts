import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WebhookEventRecord,
  WebhookEventRepository,
} from '@application/ports/webhook-event.repository';
import {
  WebhookEventSchema,
  WebhookEventStatus,
} from '../schemas/webhook-event.schema';

@Injectable()
export class TypeOrmWebhookEventRepository implements WebhookEventRepository {
  constructor(
    @InjectRepository(WebhookEventSchema)
    private readonly webhookEventRepo: Repository<WebhookEventSchema>,
  ) {}

  async exists(provider: string, eventId: string): Promise<boolean> {
    const count = await this.webhookEventRepo.count({
      where: { provider, eventId },
    });
    return count > 0;
  }

  async record(event: WebhookEventRecord): Promise<void> {
    const entity = this.webhookEventRepo.create({
      id: event.id,
      eventId: event.eventId,
      provider: event.provider,
      eventType: event.eventType,
      status: event.status ?? WebhookEventStatus.RECEIVED,
      payload: event.payload,
      processedAt: event.processedAt,
    });

    try {
      await this.webhookEventRepo.save(entity);
    } catch (error: any) {
      // Ignore duplicate key violation if already recorded concurrently
      if (error?.code === '23505') {
        return;
      }
      throw error;
    }
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
}
