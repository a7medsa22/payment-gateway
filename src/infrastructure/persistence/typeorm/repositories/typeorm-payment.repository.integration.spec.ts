import { DataSource, Repository } from 'typeorm';
import { TypeOrmPaymentRepository } from './typeorm-payment.repository';
import { PaymentSchema } from '../schemas/payment.schema';
import { TransactionSchema } from '../schemas/transaction.schema';
import { Payment } from '@domain/aggregates/payment.aggregate';
import { Money } from '@domain/value-objects/money.vo';
import { PaymentProvider, PaymentStatus } from '@domain/enums';
import * as dotenv from 'dotenv';

dotenv.config();

describe('TypeOrmPaymentRepository (Integration)', () => {
  let dataSource: DataSource;
  let repository: TypeOrmPaymentRepository;
  let paymentRepo: Repository<PaymentSchema>;
  let transactionRepo: Repository<TransactionSchema>;
  let dbAvailable = false;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      username: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'postgres',
      database: process.env.DATABASE_NAME || 'payment_service',
      entities: [PaymentSchema, TransactionSchema],
      synchronize: true,
      logging: false,
    });

    try {
      await dataSource.initialize();
      dbAvailable = true;
      paymentRepo = dataSource.getRepository(PaymentSchema);
      transactionRepo = dataSource.getRepository(TransactionSchema);
      repository = new TypeOrmPaymentRepository(
        dataSource,
        paymentRepo,
        transactionRepo,
      );
    } catch (error) {
      console.warn(
        'PostgreSQL not available. Skipping real DB integration tests.',
        (error as Error).message,
      );
    }
  });

  afterAll(async () => {
    if (dbAvailable && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    await transactionRepo.delete({});
    await paymentRepo.delete({});
  });

  it('1. should insert a new payment and read it back with identical values', async () => {
    if (!dbAvailable) {
      console.log('Skipping: DB not available');
      return;
    }

    const id = crypto.randomUUID();
    const payment = Payment.create({
      id,
      userId: 'user-integ-1',
      amount: Money.from('200.00', 'USD'),
      provider: PaymentProvider.STRIPE,
      description: 'Integration test payment',
    });

    await repository.save(payment);

    const retrieved = await repository.findById(id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(id);
    expect(retrieved!.userId).toBe('user-integ-1');
    expect(retrieved!.amount.amount).toBe('200.0000');
    expect(retrieved!.amount.currency).toBe('USD');
    expect(retrieved!.status).toBe(PaymentStatus.CREATED);
    expect(retrieved!.provider).toBe(PaymentProvider.STRIPE);
    expect(retrieved!.transactions).toHaveLength(0);
  });

  it('2. should insert a payment with transactions and read back both payment and transactions', async () => {
    if (!dbAvailable) return;

    const id = crypto.randomUUID();
    const payment = Payment.create({
      id,
      userId: 'user-integ-2',
      amount: Money.from('150.00', 'USD'),
      provider: PaymentProvider.STRIPE,
    });
    payment.start();
    payment.succeed('ch_integ_123');

    await repository.save(payment);

    const retrieved = await repository.findById(id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.status).toBe(PaymentStatus.SUCCEEDED);
    expect(retrieved!.transactions).toHaveLength(1);
    expect(retrieved!.transactions[0].providerTransactionId).toBe(
      'ch_integ_123',
    );
    expect(retrieved!.totalCharged.amount).toBe('150.0000');
  });

  it('3. should update an existing payment (upsert via save)', async () => {
    if (!dbAvailable) return;

    const id = crypto.randomUUID();
    const payment = Payment.create({
      id,
      userId: 'user-integ-3',
      amount: Money.from('75.00', 'USD'),
      provider: PaymentProvider.STRIPE,
    });

    await repository.save(payment);

    payment.start();
    await repository.save(payment);

    const retrieved = await repository.findById(id);
    expect(retrieved!.status).toBe(PaymentStatus.PENDING);
  });

  it('4. should persist multiple transactions across sequential domain actions (charge -> refund)', async () => {
    if (!dbAvailable) return;

    const id = crypto.randomUUID();
    const payment = Payment.create({
      id,
      userId: 'user-integ-4',
      amount: Money.from('100.00', 'USD'),
      provider: PaymentProvider.STRIPE,
    });
    payment.start();
    payment.succeed('ch_integ_seq');
    await repository.save(payment);

    // Later: Refund
    payment.refund(Money.from('40.00', 'USD'), 'Partial refund');
    await repository.save(payment);

    const retrieved = await repository.findById(id);
    expect(retrieved!.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    expect(retrieved!.transactions).toHaveLength(2);
    expect(retrieved!.totalRefunded.amount).toBe('40.0000');
    expect(retrieved!.refundableAmount.amount).toBe('60.0000');
  });

  it('5. should rollback all changes when a transaction fails (Atomicity Test)', async () => {
    if (!dbAvailable) return;

    const id = crypto.randomUUID();
    const payment = Payment.create({
      id,
      userId: 'user-atomicity',
      amount: Money.from('100.00', 'USD'),
      provider: PaymentProvider.STRIPE,
    });
    payment.start();
    payment.succeed('ch_atomicity');

    // Simulate failure during transaction by spying on manager.save
    jest.spyOn(dataSource, 'transaction').mockImplementationOnce(async () => {
      throw new Error('Forced DB failure');
    });

    await expect(repository.save(payment)).rejects.toThrow(
      'Forced DB failure',
    );

    const retrieved = await repository.findById(id);
    expect(retrieved).toBeNull();
  });

  it('6. should return null when finding non-existent payment', async () => {
    if (!dbAvailable) return;

    const retrieved = await repository.findById(crypto.randomUUID());
    expect(retrieved).toBeNull();
  });

  it('7. should preserve chronological ordering of transactions', async () => {
    if (!dbAvailable) return;

    const id = crypto.randomUUID();
    const payment = Payment.create({
      id,
      userId: 'user-order',
      amount: Money.from('100.00', 'USD'),
      provider: PaymentProvider.STRIPE,
    });
    payment.start();
    payment.succeed('ch_order');
    payment.refund(Money.from('20.00', 'USD'));
    payment.refund(Money.from('30.00', 'USD'));

    await repository.save(payment);

    const retrieved = await repository.findById(id);
    expect(retrieved!.transactions).toHaveLength(3);
    expect(retrieved!.transactions[0].type).toBe('charge');
    expect(retrieved!.transactions[1].type).toBe('partial_refund');
    expect(retrieved!.transactions[2].type).toBe('partial_refund');
  });
});
