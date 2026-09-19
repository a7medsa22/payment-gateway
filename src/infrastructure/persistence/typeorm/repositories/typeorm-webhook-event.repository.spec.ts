import { Repository } from 'typeorm';
import { TypeOrmWebhookEventRepository } from './typeorm-webhook-event.repository';
import {
  WebhookEventSchema,
  WebhookEventStatus,
} from '../schemas/webhook-event.schema';

describe('TypeOrmWebhookEventRepository', () => {
  let repository: TypeOrmWebhookEventRepository;
  let mockRepo: jest.Mocked<Repository<WebhookEventSchema>>;

  beforeEach(() => {
    mockRepo = {
      count: jest.fn(),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<WebhookEventSchema>>;

    repository = new TypeOrmWebhookEventRepository(mockRepo);
  });

  describe('exists()', () => {
    it('should return true when count > 0', async () => {
      mockRepo.count.mockResolvedValue(1);

      const result = await repository.exists('STRIPE', 'evt_123');

      expect(result).toBe(true);
      expect(mockRepo.count).toHaveBeenCalledWith({
        where: { provider: 'STRIPE', eventId: 'evt_123' },
      });
    });

    it('should return false when count === 0', async () => {
      mockRepo.count.mockResolvedValue(0);

      const result = await repository.exists('STRIPE', 'evt_999');

      expect(result).toBe(false);
    });
  });

  describe('record()', () => {
    it('should create and save webhook event entity', async () => {
      mockRepo.save.mockResolvedValue({} as any);

      await repository.record({
        id: 'evt-uuid-1',
        eventId: 'evt_123',
        provider: 'STRIPE',
        eventType: 'payment_intent.succeeded',
        payload: { id: 'pi_123' },
      });

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'evt-uuid-1',
          eventId: 'evt_123',
          provider: 'STRIPE',
          eventType: 'payment_intent.succeeded',
          status: WebhookEventStatus.RECEIVED,
        }),
      );
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('should gracefully handle duplicate key error (code 23505)', async () => {
      const error: any = new Error('duplicate key value');
      error.code = '23505';
      mockRepo.save.mockRejectedValue(error);

      await expect(
        repository.record({
          id: 'evt-uuid-1',
          eventId: 'evt_123',
          provider: 'STRIPE',
          eventType: 'payment_intent.succeeded',
        }),
      ).resolves.not.toThrow();
    });

    it('should rethrow non-duplicate errors', async () => {
      const error = new Error('Database connection lost');
      mockRepo.save.mockRejectedValue(error);

      await expect(
        repository.record({
          id: 'evt-uuid-1',
          eventId: 'evt_123',
          provider: 'STRIPE',
          eventType: 'payment_intent.succeeded',
        }),
      ).rejects.toThrow('Database connection lost');
    });
  });

  describe('markProcessed()', () => {
    it('should update status to PROCESSED with processedAt', async () => {
      mockRepo.update.mockResolvedValue({} as any);

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
});
