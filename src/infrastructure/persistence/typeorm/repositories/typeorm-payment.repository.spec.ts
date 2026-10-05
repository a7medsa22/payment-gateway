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

  let mockQueryBuilder: {
    update: jest.Mock;
    set: jest.Mock;
    where: jest.Mock;
    execute: jest.Mock;
  };

  beforeEach(() => {
    mockQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    entityManager = {
      insert: jest.fn().mockResolvedValue(undefined),
      upsert: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
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
    it('should INSERT a new aggregate with version 1 and upsert child transactions', async () => {
      const payment = Payment.create({
        id: 'pay-unit-1',
        merchantId: 'merchant-unit-1',
        userId: 'user-unit-1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });
      payment.start();
      payment.succeed('ch_unit_1');

      await repository.save(payment);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(entityManager.insert).toHaveBeenCalledWith(
        PaymentSchema,
        expect.objectContaining({ id: 'pay-unit-1', version: 1 }),
      );
      expect(entityManager.upsert).toHaveBeenCalledWith(
        TransactionSchema,
        expect.arrayContaining([
          expect.objectContaining({
            paymentId: 'pay-unit-1',
            providerTransactionId: 'ch_unit_1',
          }),
        ]),
        { conflictPaths: ['id'], skipUpdateIfNoValuesChanged: true },
      );
      expect(payment.version).toBe(1);
    });

    it('should not call transaction upsert if payment has no transactions', async () => {
      const payment = Payment.create({
        id: 'pay-no-tx',
        merchantId: 'merchant-unit-1',
        userId: 'user-unit-1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });

      await repository.save(payment);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(entityManager.insert).toHaveBeenCalledTimes(1);
      expect(entityManager.upsert).not.toHaveBeenCalled();
      expect(payment.version).toBe(1);
    });

    it('should UPDATE an existing aggregate with version matching and increment version', async () => {
      const payment = Payment.reconstitute({
        id: 'pay-existing',
        merchantId: 'merchant-unit-1',
        userId: 'user-unit-1',
        amount: Money.from('100.00', 'USD'),
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.STRIPE,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      payment.succeed('ch_existing');

      await repository.save(payment);

      expect(mockQueryBuilder.update).toHaveBeenCalledWith(PaymentSchema);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'id = :id AND version = :version',
        { id: 'pay-existing', version: 1 },
      );
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
      expect(payment.version).toBe(2);
    });

    it('should throw ConcurrencyException when affected rows is 0 on update', async () => {
      mockQueryBuilder.execute.mockResolvedValueOnce({ affected: 0 });

      const payment = Payment.reconstitute({
        id: 'pay-conflict',
        merchantId: 'merchant-unit-1',
        userId: 'user-unit-1',
        amount: Money.from('100.00', 'USD'),
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.STRIPE,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(repository.save(payment)).rejects.toThrow(
        'Aggregate pay-conflict was modified concurrently. Please retry.',
      );
    });

    it('should propagate errors from inside transaction callback', async () => {
      entityManager.insert.mockRejectedValueOnce(new Error('DB connection failed'));

      const payment = Payment.create({
        id: 'pay-fail-tx',
        merchantId: 'merchant-unit-1',
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
      paymentSchema.merchantId = 'merchant-unit-1';
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

  describe('findByProviderPaymentId()', () => {
    it('should return null when payment is not found by providerPaymentId', async () => {
      paymentRepo.findOne.mockResolvedValue(null);

      const result = await repository.findByProviderPaymentId('pi_nonexistent');

      expect(result).toBeNull();
      expect(transactionRepo.find).not.toHaveBeenCalled();
    });

    it('should find payment by providerPaymentId and load its transactions', async () => {
      const paymentSchema = new PaymentSchema();
      paymentSchema.id = 'pay-found-2';
      paymentSchema.merchantId = 'merchant-unit-1';
      paymentSchema.userId = 'user-2';
      paymentSchema.amount = '50.0000';
      paymentSchema.currency = 'USD';
      paymentSchema.status = PaymentStatus.PENDING;
      paymentSchema.provider = PaymentProvider.STRIPE;
      paymentSchema.providerPaymentId = 'pi_found_123';
      paymentSchema.createdAt = new Date('2025-01-01');
      paymentSchema.updatedAt = new Date('2025-01-01');

      paymentRepo.findOne.mockResolvedValue(paymentSchema);
      transactionRepo.find.mockResolvedValue([]);

      const payment = await repository.findByProviderPaymentId('pi_found_123');

      expect(payment).not.toBeNull();
      expect(payment!.id).toBe('pay-found-2');
      expect(paymentRepo.findOne).toHaveBeenCalledWith({
        where: { providerPaymentId: 'pi_found_123' },
      });
      expect(transactionRepo.find).toHaveBeenCalledWith({
        where: { paymentId: 'pay-found-2' },
        order: { createdAt: 'ASC' },
      });
    });
  });
});
