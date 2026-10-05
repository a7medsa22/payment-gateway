import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { WebhookEventStatus } from '../../../../application/ports/webhook-event.repository';

export { WebhookEventStatus };

@Entity('webhook_events')
@Index('idx_webhook_events_provider_event_id', ['provider', 'eventId'], {
  unique: true,
})
export class WebhookEventSchema {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'event_id', type: 'varchar', length: 255 })
  eventId!: string;

  @Column({ type: 'varchar', length: 50 })
  provider!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType!: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: WebhookEventStatus.RECEIVED,
  })
  status!: string;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'last_error', type: 'varchar', length: 1000, nullable: true })
  lastError?: string;

  @Column({ type: 'jsonb', nullable: true })
  payload?: Record<string, unknown>;

  @Column({
    name: 'processed_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  processedAt?: Date;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
  })
  createdAt!: Date;
}
