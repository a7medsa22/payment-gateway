import { Repository } from 'typeorm';
import { TypeOrmWebhookEventRepository } from './typeorm-webhook-event.repository';
import { WebhookEventSchema } from '../schemas/webhook-event.schema';
import { WebhookEventStatus } from '@application/ports/webhook-event.repository';

describe('TypeOrmWebhookEventRepository', () => {
  let repository: TypeOrmWebhookEventRepository;
  let mockRepo: jest.Mocked<Repository<WebhookEventSchema>>;
  let mockQueryBuilder: any;

  beforeEach(() => {
    mockQueryBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };

    mockRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      findOneByOrFail: jest.fn(),
      update: jest.fn().mockResolvedValue({} as any),
    } as unknown as jest.Mocked<Repository<WebhookEventSchema>>;

    repository = new TypeOrmWebhookEventRepository(mockRepo);
  });

  describe('claim()', () => {
    it('should return "new" when the event was inserted successfully', async () => {
      mockQueryBuilder.execute.mockResolvedValueOnce({ raw: [{ id: 'evt-uuid-1' }] });

      const result = await repository.claim({
        id: 'evt-uuid-1',
        eventId: 'evt_new_1',
        provider: 'STRIPE',
        eventType: 'payment_intent.succeeded',
        payload: { id: 'pi_1' },
      });

      expect(result).toBe('new');
      expect(mockQueryBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'evt-uuid-1',
          eventId: 'evt_new_1',
          provider: 'STRIPE',
          status: WebhookEventStatus.RECEIVED,
        }),
      );
    });

    it('should return "processed" when event already completed processing', async () => {
      mockQueryBuilder.execute.mockResolvedValueOnce({ raw: [] });
      mockRepo.findOneByOrFail.mockResolvedValueOnce({
        id: 'evt-uuid-1',
        eventId: 'evt_done_1',
        provider: 'STRIPE',
        status: WebhookEventStatus.PROCESSED,
      } as any);

      const result = await repository.claim({
        id: 'evt-uuid-1',
        eventId: 'evt_done_1',
        provider: 'STRIPE',
        eventType: 'payment_intent.succeeded',
        payload: { id: 'pi_1' },
      });

      expect(result).toBe('processed');
    });

    it('should return "retry" when existing event was left in RECEIVED or FAILED status', async () => {
      mockQueryBuilder.execute.mockResolvedValueOnce({ raw: [] });
      mockRepo.findOneByOrFail.mockResolvedValueOnce({
        id: 'evt-uuid-1',
        eventId: 'evt_failed_1',
        provider: 'STRIPE',
        status: WebhookEventStatus.FAILED,
      } as any);

      const result = await repository.claim({
        id: 'evt-uuid-1',
        eventId: 'evt_failed_1',
        provider: 'STRIPE',
        eventType: 'payment_intent.succeeded',
        payload: { id: 'pi_1' },
      });

      expect(result).toBe('retry');
    });
  });

  describe('markProcessed()', () => {
    it('should update status to PROCESSED with processedAt', async () => {
      await repository.markProcessed('STRIPE', 'evt_123');

      expect(mockRepo.update).toHaveBeenCalledWith(
        { provider: 'STRIPE', eventId: 'evt_123' },
        expect.objectContaining({
          status: WebhookEventStatus.PROCESSED,
          processedAt: expect.any(Date),
        }),
      );
    });
  });

  describe('markFailed()', () => {
    it('should update status to FAILED, record lastError and increment attempts', async () => {
      await repository.markFailed('STRIPE', 'evt_123', 'Network error');

      expect(mockRepo.update).toHaveBeenCalledWith(
        { provider: 'STRIPE', eventId: 'evt_123' },
        expect.objectContaining({
          status: WebhookEventStatus.FAILED,
          lastError: 'Network error',
        }),
      );
    });
  });

  describe('markRequiresReview()', () => {
    it('should update status to REQUIRES_REVIEW and record lastError', async () => {
      await repository.markRequiresReview('STRIPE', 'evt_123', 'Amount mismatch');

      expect(mockRepo.update).toHaveBeenCalledWith(
        { provider: 'STRIPE', eventId: 'evt_123' },
        expect.objectContaining({
          status: WebhookEventStatus.REQUIRES_REVIEW,
          lastError: 'Amount mismatch',
        }),
      );
    });
  });
});
