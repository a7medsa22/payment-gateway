import { DataSource, Repository } from 'typeorm';
import * as dotenv from 'dotenv';
import { TypeOrmPaymentRepository } from '@infrastructure/persistence/typeorm/repositories/typeorm-payment.repository';
import { TypeOrmWebhookEventRepository } from '@infrastructure/persistence/typeorm/repositories/typeorm-webhook-event.repository';
import { PaymentSchema } from '@infrastructure/persistence/typeorm/schemas/payment.schema';
import { TransactionSchema } from '@infrastructure/persistence/typeorm/schemas/transaction.schema';
import { WebhookEventSchema } from '@infrastructure/persistence/typeorm/schemas/webhook-event.schema';
import { ApiKeySchema } from '@infrastructure/auth/schemas/api-key.schema';
import { Payment } from '@domain/aggregates/payment.aggregate';
import { Money } from '@domain/value-objects/money.vo';
import {
  PaymentProvider,
  PaymentStatus,
  FailureReason,
} from '@domain/enums';
import {
  ConcurrencyException,
  DomainException,
} from '@domain/exceptions/domain.exception';
import { RefundPaymentUseCase } from '@application/use-cases/refund-payment/refund-payment.use-case';
import { PaymentGateway } from '@application/ports/payment-gateway.port';
import { PaymentGatewayResolver } from '@application/ports/payment-gateway-resolver.port';

dotenv.config();

describe('Concurrency & Financial Correctness (Integration)', () => {
  let dataSource: DataSource;
  let paymentRepository: TypeOrmPaymentRepository;
  let webhookEventRepository: TypeOrmWebhookEventRepository;
  let paymentRepo: Repository<PaymentSchema>;
  let transactionRepo: Repository<TransactionSchema>;
  let webhookEventRepo: Repository<WebhookEventSchema>;
  let dbAvailable = false;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      username: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'postgres',
      database: process.env.DATABASE_NAME || 'payment_service',
      entities: [
        PaymentSchema,
        TransactionSchema,
        WebhookEventSchema,
        ApiKeySchema,
      ],
      synchronize: false,
      logging: false,
    });

    try {
      await dataSource.initialize();
      dbAvailable = true;
      paymentRepo = dataSource.getRepository(PaymentSchema);
      transactionRepo = dataSource.getRepository(TransactionSchema);
      webhookEventRepo = dataSource.getRepository(WebhookEventSchema);

      paymentRepository = new TypeOrmPaymentRepository(
        dataSource,
        paymentRepo,
        transactionRepo,
      );
      webhookEventRepository = new TypeOrmWebhookEventRepository(
        webhookEventRepo,
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
    await dataSource.query(
      'DELETE FROM webhook_events; DELETE FROM transactions; DELETE FROM payments;',
    );
  });

  it('1. Two copies of the same payment saved with the same version: one succeeds, one throws ConcurrencyException', async () => {
    if (!dbAvailable) return;

    const payment = Payment.create({
      id: crypto.randomUUID(),
      merchantId: 'merchant_conc_1',
      userId: 'user_conc_1',
      amount: Money.from('100.00', 'USD'),
      provider: PaymentProvider.STRIPE,
    });
    await paymentRepository.save(payment);
    expect(payment.version).toBe(1);

    // Read back two separate instances
    const p1 = await paymentRepository.findById(payment.id);
    const p2 = await paymentRepository.findById(payment.id);

    expect(p1).not.toBeNull();
    expect(p2).not.toBeNull();
    expect(p1!.version).toBe(1);
    expect(p2!.version).toBe(1);

    // Save first copy
    p1!.start();
    await paymentRepository.save(p1!);
    expect(p1!.version).toBe(2);

    // Attempt to save second stale copy
    p2!.start();
    await expect(paymentRepository.save(p2!)).rejects.toThrow(
      ConcurrencyException,
    );
  });

  it('2. Two parallel refunds of 60% each: one reserves, other gets DomainException (exceeds refundable)', async () => {
    if (!dbAvailable) return;

    const payment = Payment.create({
      id: crypto.randomUUID(),
      merchantId: 'merchant_conc_2',
      userId: 'user_conc_2',
      amount: Money.from('100.00', 'USD'),
      provider: PaymentProvider.STRIPE,
    });
    payment.start();
    payment.succeed('pi_conc_refund_2');
    await paymentRepository.save(payment);

    const mockGateway: jest.Mocked<PaymentGateway> = {
      createPayment: jest.fn(),
      refundPayment: jest.fn().mockImplementation(async (req) => ({
        refundTransactionId: 're_' + req.refundTxId,
        status: 'succeeded',
      })),
    };

    const mockResolver: PaymentGatewayResolver = {
      resolve: () => mockGateway,
    };

    const refundUseCase = new RefundPaymentUseCase(
      paymentRepository,
      mockResolver,
    );

    // Trigger two parallel 60% refunds concurrently
    const results = await Promise.allSettled([
      refundUseCase.execute({
        merchantId: 'merchant_conc_2',
        paymentId: payment.id,
        userId: 'user_conc_2',
        amount: '60.00',
        currency: 'USD',
      }),
      refundUseCase.execute({
        merchantId: 'merchant_conc_2',
        paymentId: payment.id,
        userId: 'user_conc_2',
        amount: '60.00',
        currency: 'USD',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const error = (rejected[0] as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(DomainException);
    expect(error.message).toMatch(/exceeds refundable/i);
  });

  it('3. Webhook handler throws once, then Stripe retries: second delivery processes (claim returns retry)', async () => {
    if (!dbAvailable) return;

    const eventId = 'evt_retry_' + crypto.randomUUID();

    // Delivery 1: initial claim
    const claim1 = await webhookEventRepository.claim({
      id: crypto.randomUUID(),
      eventId,
      provider: 'STRIPE',
      eventType: 'payment_intent.succeeded',
      payload: { id: 'pi_test' },
    });
    expect(claim1).toBe('new');

    // Handler encounters a transient error and marks failed
    await webhookEventRepository.markFailed(
      'STRIPE',
      eventId,
      'Temporary network failure',
    );

    // Delivery 2: Stripe retries
    const claim2 = await webhookEventRepository.claim({
      id: crypto.randomUUID(),
      eventId,
      provider: 'STRIPE',
      eventType: 'payment_intent.succeeded',
      payload: { id: 'pi_test' },
    });
    expect(claim2).toBe('retry');

    // Handler succeeds and marks processed
    await webhookEventRepository.markProcessed('STRIPE', eventId);

    // Delivery 3: Replay after success
    const claim3 = await webhookEventRepository.claim({
      id: crypto.randomUUID(),
      eventId,
      provider: 'STRIPE',
      eventType: 'payment_intent.succeeded',
      payload: { id: 'pi_test' },
    });
    expect(claim3).toBe('processed');
  });

  it('4. Same webhook delivered concurrently x5: exactly one charge transaction / claim as new', async () => {
    if (!dbAvailable) return;

    const eventId = 'evt_race_' + crypto.randomUUID();

    // 5 concurrent claims for identical eventId
    const claims = await Promise.all(
      Array.from({ length: 5 }, () =>
        webhookEventRepository.claim({
          id: crypto.randomUUID(),
          eventId,
          provider: 'STRIPE',
          eventType: 'payment_intent.succeeded',
          payload: { id: 'pi_conc_4' },
        }),
      ),
    );

    const newClaims = claims.filter((c) => c === 'new');
    expect(newClaims).toHaveLength(1);
  });

  it('5. succeed() then save() clears errorCode: column is NULL in DB', async () => {
    if (!dbAvailable) return;

    const payment = Payment.create({
      id: crypto.randomUUID(),
      merchantId: 'merchant_conc_5',
      userId: 'user_conc_5',
      amount: Money.from('100.00', 'USD'),
      provider: PaymentProvider.STRIPE,
    });
    payment.start();
    payment.process();
    await paymentRepository.save(payment);

    // Simulate transient error code present on the payment record
    await dataSource.query(
      `UPDATE payments SET error_code = 'temporary_decline', failure_reason = 'insufficient_funds' WHERE id = $1`,
      [payment.id],
    );

    const loaded = await paymentRepository.findById(payment.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.errorCode).toBe('temporary_decline');
    expect(loaded!.failureReason).toBe(FailureReason.INSUFFICIENT_FUNDS);

    // Call succeed() which clears errorCode and failureReason
    loaded!.succeed('pi_cleared_test');
    await paymentRepository.save(loaded!);

    // Verify errorCode & failureReason are cleared (NULL) in DB
    const rawAfter = await dataSource.query(
      'SELECT error_code, failure_reason, status FROM payments WHERE id = $1',
      [payment.id],
    );
    expect(rawAfter[0].status).toBe(PaymentStatus.SUCCEEDED);
    expect(rawAfter[0].error_code).toBeNull();
    expect(rawAfter[0].failure_reason).toBeNull();
  });

  it('6. Migration InitialSchema on DB: applies cleanly and migrations table is recorded', async () => {
    if (!dbAvailable) return;

    const migrations = await dataSource.query('SELECT * FROM "migrations"');
    expect(migrations.length).toBeGreaterThanOrEqual(1);
    expect(
      migrations.some((m: { name: string }) =>
        m.name.includes('InitialSchema'),
      ),
    ).toBe(true);
  });
});
