export enum WebhookEventStatus {
  RECEIVED = 'RECEIVED',
  PROCESSED = 'PROCESSED',
  IGNORED = 'IGNORED',
  FAILED = 'FAILED', // transient, will be retried
  REQUIRES_REVIEW = 'REQUIRES_REVIEW', // anomaly, needs a human (alert)
}

export type ClaimResult = 'new' | 'retry' | 'processed';

export interface WebhookEventRecord {
  id: string;
  eventId: string;
  provider: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface WebhookEventRepository {
  /** Atomic insert-or-inspect. 'processed' → skip; 'new' | 'retry' → process. */
  claim(event: WebhookEventRecord): Promise<ClaimResult>;
  markProcessed(provider: string, eventId: string): Promise<void>;
  markFailed(provider: string, eventId: string, error: string): Promise<void>;
  markRequiresReview(
    provider: string,
    eventId: string,
    reason: string,
  ): Promise<void>;
}
