import { DataSource, EntityManager, Repository } from 'typeorm';
import { TypeOrmPaymentRepository } from './typeorm-payment.repository';
import { PaymentSchema } from '../schemas/payment.schema';
import { TransactionSchema } from '../schemas/transaction.schema';
import { Payment } from '@domain/aggregates/payment.aggregate';
import { Money } from '@domain/value-objects/money.vo';
import { PaymentProvider, PaymentStatus } from '@domain/enums';

describe('TypeOrmPaymentRepository (Unit Tests)', () => {
  let repository: TypeOrmPaymentRepository;
  let dataSource: jest.Mocked<DataSource>;
  let paymentRepo: jest.Mocked<Repository<PaymentSchema>>;
  let transactionRepo: jest.Mocked<Repository<TransactionSchema>>;
  let entityManager: jest.Mocked<EntityManager>;

  beforeEach(() => {
    entityManager = {
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EntityManager>;

    dataSource = {
      transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(entityManager);
      }),
    } as unknown as jest.Mocked<DataSource>;

    paymentRepo = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<PaymentSchema>>;

    transactionRepo = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<TransactionSchema>>;

    repository = new TypeOrmPaymentRepository(
      dataSource,
      paymentRepo,
      transactionRepo,
    );
  });

  describe('save()', () => {
    it('should save payment and child transactions inside a database transaction', () => {
      const payment = Payment.create({
        id: 'pay-unit-1',
        userId: 'user-unit-1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });
      payment.start();
      payment.succeed('ch_unit_1');

      return repository.save(payment).then(() => {
        expect(dataSource.transaction).toHaveBeenCalledTimes(1);
        expect(entityManager.save).toHaveBeenCalledWith(
          PaymentSchema,
          expect.objectContaining({ id: 'pay-unit-1' }),
        );
        expect(entityManager.save).toHaveBeenCalledWith(
          TransactionSchema,
          expect.arrayContaining([
            expect.objectContaining({
              paymentId: 'pay-unit-1',
              providerTransactionId: 'ch_unit_1',
            }),
          ]),
        );
      });
    });

    it('should not call transaction save for transactions if payment has no transactions', () => {
      const payment = Payment.create({
        id: 'pay-no-tx',
        userId: 'user-unit-1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });

      return repository.save(payment).then(() => {
        expect(dataSource.transaction).toHaveBeenCalledTimes(1);
        expect(entityManager.save).toHaveBeenCalledTimes(1);
        expect(entityManager.save).toHaveBeenCalledWith(
          PaymentSchema,
          expect.objectContaining({ id: 'pay-no-tx' }),
        );
      });
    });

    it('should propagate errors from inside transaction callback', async () => {
      entityManager.save.mockRejectedValueOnce(new Error('DB connection failed'));

      const payment = Payment.create({
        id: 'pay-fail-tx',
        userId: 'user-unit-1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });

      await expect(repository.save(payment)).rejects.toThrow(
        'DB connection failed',
      );
    });
  });

  describe('findById()', () => {
    it('should return null when payment is not found', async () => {
      paymentRepo.findOne.mockResolvedValue(null);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
      expect(transactionRepo.find).not.toHaveBeenCalled();
    });

    it('should find payment and its child transactions ordered by createdAt ASC', async () => {
      const paymentSchema = new PaymentSchema();
      paymentSchema.id = 'pay-found-1';
      paymentSchema.userId = 'user-1';
      paymentSchema.amount = '100.0000';
      paymentSchema.currency = 'USD';
      paymentSchema.status = PaymentStatus.SUCCEEDED;
      paymentSchema.provider = PaymentProvider.STRIPE;
      paymentSchema.createdAt = new Date('2025-01-01');
      paymentSchema.updatedAt = new Date('2025-01-01');

      const txSchema = new TransactionSchema();
      txSchema.id = 'tx-1';
      txSchema.paymentId = 'pay-found-1';
      txSchema.type = 'charge';
      txSchema.status = 'succeeded';
      txSchema.amount = '100.0000';
      txSchema.currency = 'USD';
      txSchema.provider = 'stripe';
      txSchema.createdAt = new Date('2025-01-01');

      paymentRepo.findOne.mockResolvedValue(paymentSchema);
      transactionRepo.find.mockResolvedValue([txSchema]);

      const payment = await repository.findById('pay-found-1');

      expect(payment).not.toBeNull();
      expect(payment!.id).toBe('pay-found-1');
      expect(payment!.transactions).toHaveLength(1);
      expect(transactionRepo.find).toHaveBeenCalledWith({
        where: { paymentId: 'pay-found-1' },
        order: { createdAt: 'ASC' },
      });
    });
  });
});
