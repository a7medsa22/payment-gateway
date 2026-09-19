export interface WebhookEventRecord {
  id: string;
  eventId: string;
  provider: string;
  eventType: string;
  status?: string;
  payload?: Record<string, unknown>;
  processedAt?: Date;
}

export interface WebhookEventRepository {
  exists(provider: string, eventId: string): Promise<boolean>;
  record(event: WebhookEventRecord): Promise<void>;
  markProcessed(provider: string, eventId: string): Promise<void>;
}
