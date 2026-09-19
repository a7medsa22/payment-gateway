import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as supertest from 'supertest';
const request = (supertest as any).default || supertest;
import { PaymentController } from '../src/presentation/controllers/payment.controller';
import { StripeWebhookController } from '../src/presentation/controllers/stripe-webhook.controller';
import { HttpExceptionFilter } from '../src/presentation/filters/http-exception.filter';
import { PaymentRepository } from '@application/ports/payment.repository';
import {
  WebhookEventRecord,
  WebhookEventRepository,
} from '@application/ports/webhook-event.repository';
import { PaymentGatewayResolver } from '@application/ports/payment-gateway-resolver.port';
import { PaymentGateway } from '@application/ports/payment-gateway.port';
import { CreatePaymentUseCase } from '@application/use-cases/create-payment/create-payment.use-case';
import { GetPaymentUseCase } from '@application/use-cases/get-payment/get-payment.use-case';
import { RefundPaymentUseCase } from '@application/use-cases/refund-payment/refund-payment.use-case';
import { Payment } from '@domain/aggregates/payment.aggregate';
import { PaymentProvider, PaymentStatus } from '@domain/enums';

// In-Memory Test Implementations for Hermetic E2E Execution
class InMemoryPaymentRepository implements PaymentRepository {
  private readonly storage = new Map<string, Payment>();

  async save(payment: Payment): Promise<void> {
    this.storage.set(payment.id, payment);
  }

  async findById(id: string): Promise<Payment | null> {
    return this.storage.get(id) ?? null;
  }

  async findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<Payment | null> {
    for (const p of this.storage.values()) {
      if (p.providerPaymentId === providerPaymentId) {
        return p;
      }
    }
    return null;
  }
}

class InMemoryWebhookEventRepository implements WebhookEventRepository {
  private readonly recorded = new Map<string, WebhookEventRecord>();

  async exists(provider: string, eventId: string): Promise<boolean> {
    return this.recorded.has(`${provider}:${eventId}`);
  }

  async record(event: WebhookEventRecord): Promise<void> {
    this.recorded.set(`${event.provider}:${event.eventId}`, event);
  }

  async markProcessed(provider: string, eventId: string): Promise<void> {
    const key = `${provider}:${eventId}`;
    const existing = this.recorded.get(key);
    if (existing) {
      existing.status = 'PROCESSED';
      existing.processedAt = new Date();
    }
  }
}

describe('Payment Gateway HTTP API (e2e)', () => {
  let app: INestApplication;
  let paymentRepo: InMemoryPaymentRepository;
  let webhookRepo: InMemoryWebhookEventRepository;
  let mockGateway: jest.Mocked<PaymentGateway>;
  let mockStripe: { webhooks: { constructEvent: jest.Mock } };

  beforeAll(async () => {
    paymentRepo = new InMemoryPaymentRepository();
    webhookRepo = new InMemoryWebhookEventRepository();

    mockGateway = {
      createPayment: jest.fn().mockImplementation(async (req) => ({
        providerPaymentId: `pi_test_${req.paymentId}`,
        status: 'pending',
        clientSecret: `pi_test_${req.paymentId}_secret`,
      })),
    };

    const mockResolver: PaymentGatewayResolver = {
      resolve: () => mockGateway,
    };

    mockStripe = {
      webhooks: {
        constructEvent: jest.fn().mockImplementation((rawBody, sig) => {
          if (sig === 'valid_stripe_signature') {
            const bodyStr = Buffer.isBuffer(rawBody)
              ? rawBody.toString('utf8')
              : typeof rawBody === 'string'
                ? rawBody
                : JSON.stringify(rawBody);
            return JSON.parse(bodyStr);
          }
          throw new Error('Invalid signature');
        }),
      },
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'providers.stripe.secretKey') return 'sk_test_mock';
        if (key === 'providers.stripe.webhookSecret') return 'whsec_test_mock';
        return undefined;
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController, StripeWebhookController],
      providers: [
        {
          provide: 'PaymentRepository',
          useValue: paymentRepo,
        },
        {
          provide: 'WebhookEventRepository',
          useValue: webhookRepo,
        },
        {
          provide: 'PaymentGatewayResolver',
          useValue: mockResolver,
        },
        {
          provide: 'STRIPE_CLIENT',
          useValue: mockStripe,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: CreatePaymentUseCase,
          useFactory: (
            repo: PaymentRepository,
            resolver: PaymentGatewayResolver,
          ) => new CreatePaymentUseCase(repo, resolver),
          inject: ['PaymentRepository', 'PaymentGatewayResolver'],
        },
        {
          provide: GetPaymentUseCase,
          useFactory: (repo: PaymentRepository) => new GetPaymentUseCase(repo),
          inject: ['PaymentRepository'],
        },
        {
          provide: RefundPaymentUseCase,
          useFactory: (repo: PaymentRepository) =>
            new RefundPaymentUseCase(repo),
          inject: ['PaymentRepository'],
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });

    // Apply exact same pipeline as main.ts
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/payments (Create Payment)', () => {
    it('should create payment and return 201 Created', async () => {
      const payload = {
        userId: 'user_e2e_1',
        amount: '89.99',
        currency: 'USD',
        provider: PaymentProvider.STRIPE,
        description: 'E2E test charge',
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .send(payload)
        .expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(String),
        userId: 'user_e2e_1',
        amount: '89.9900',
        currency: 'USD',
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.STRIPE,
        providerPaymentId: expect.stringContaining('pi_test_'),
        clientSecret: expect.stringContaining('_secret'),
        createdAt: expect.any(String),
      });

      // Verify stored in repository
      const saved = await paymentRepo.findById(res.body.id);
      expect(saved).not.toBeNull();
      expect(saved!.amount.amount).toBe('89.9900');
    });

    it('should return 400 Bad Request if required fields are missing', async () => {
      const invalidPayload = {
        amount: '89.99',
        // missing userId, currency, provider
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .send(invalidPayload)
        .expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        timestamp: expect.any(String),
      });
      expect(Array.isArray(res.body.message)).toBe(true);
    });

    it('should return 400 Bad Request for unsupported currency', async () => {
      const payload = {
        userId: 'user_e2e_1',
        amount: '50.00',
        currency: 'INVALID_CURRENCY',
        provider: PaymentProvider.STRIPE,
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .send(payload)
        .expect(400);

      expect(res.body.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/payments/:id (Get Payment)', () => {
    it('should return 200 OK with payment details for existing payment', async () => {
      // First create a payment
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .send({
          userId: 'user_e2e_get',
          amount: '120.50',
          currency: 'EUR',
          provider: PaymentProvider.STRIPE,
        })
        .expect(201);

      const paymentId = createRes.body.id;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/payments/${paymentId}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: paymentId,
        userId: 'user_e2e_get',
        amount: '120.5000',
        currency: 'EUR',
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.STRIPE,
        totalCharged: '0.0000',
        totalRefunded: '0.0000',
        refundableAmount: '0.0000',
        transactions: expect.any(Array),
      });
    });

    it('should return 404 Not Found for non-existent payment ID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/payments/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(res.body).toMatchObject({
        statusCode: 404,
        error: 'PaymentNotFoundException',
        message: expect.stringContaining('not found'),
      });
    });
  });

  describe('POST /api/v1/payments/:id/refund (Refund Payment)', () => {
    it('should return 422 Unprocessable Entity when attempting to refund a PENDING payment', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .send({
          userId: 'user_e2e_refund_fail',
          amount: '50.00',
          currency: 'USD',
          provider: PaymentProvider.STRIPE,
        })
        .expect(201);

      const paymentId = createRes.body.id;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/payments/${paymentId}/refund`)
        .send({ amount: '25.00' })
        .expect(422);

      expect(res.body).toMatchObject({
        statusCode: 422,
        error: 'PaymentException',
        message: expect.stringContaining(
          'Cannot refund payment from status: pending',
        ),
      });
    });

    it('should refund a SUCCEEDED payment and return 200 OK', async () => {
      // Create payment
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .send({
          userId: 'user_e2e_refund_ok',
          amount: '100.00',
          currency: 'USD',
          provider: PaymentProvider.STRIPE,
        })
        .expect(201);

      const paymentId = createRes.body.id;
      const payment = await paymentRepo.findById(paymentId);
      // Manually mark succeeded to simulate successful completion
      payment!.succeed('ch_stripe_e2e_100');
      await paymentRepo.save(payment!);

      // Execute partial refund
      const refundRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${paymentId}/refund`)
        .send({ amount: '40.00', reason: 'Customer requested partial refund' })
        .expect(200);

      expect(refundRes.body).toMatchObject({
        paymentId,
        status: PaymentStatus.PARTIALLY_REFUNDED,
        amount: '100.0000',
        currency: 'USD',
        totalRefunded: '40.0000',
        refundableAmount: '60.0000',
        reason: 'Customer requested partial refund',
      });
    });
  });

  describe('POST /api/v1/webhooks/stripe (Stripe Webhooks & Deduplication)', () => {
    it('should return 400 Bad Request when stripe-signature header is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/stripe')
        .send({ id: 'evt_1' })
        .expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        message: 'Missing stripe-signature header',
      });
    });

    it('should return 400 Bad Request when signature is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/stripe')
        .set('stripe-signature', 'invalid_signature')
        .send({ id: 'evt_bad_sig' })
        .expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        message: expect.stringContaining(
          'Webhook signature verification failed',
        ),
      });
    });

    it('should successfully handle payment_intent.succeeded and transition payment state', async () => {
      // 1. Create a payment
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/payments')
        .send({
          userId: 'user_e2e_webhook',
          amount: '75.00',
          currency: 'USD',
          provider: PaymentProvider.STRIPE,
        })
        .expect(201);

      const paymentId = createRes.body.id;
      const intentId = createRes.body.providerPaymentId;

      // 2. Deliver webhook event
      const eventPayload = {
        id: 'evt_e2e_success_1',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: intentId,
            metadata: { paymentId },
          },
        },
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/webhooks/stripe')
        .set('stripe-signature', 'valid_stripe_signature')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(eventPayload))
        .expect(200);

      expect(res.body).toEqual({ received: true, status: 'succeeded' });

      // Verify payment transitioned to SUCCEEDED
      const updatedPayment = await paymentRepo.findById(paymentId);
      expect(updatedPayment!.status).toBe(PaymentStatus.SUCCEEDED);

      // Verify event was persisted in WebhookEventRepository (Option A)
      const eventExists = await webhookRepo.exists(
        'STRIPE',
        'evt_e2e_success_1',
      );
      expect(eventExists).toBe(true);
    });

    it('should deduplicate replay of the same webhook event (Persistent Deduplication)', async () => {
      const eventPayload = {
        id: 'evt_e2e_replay_1',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_replay',
            metadata: {},
          },
        },
      };

      // First delivery
      const firstRes = await request(app.getHttpServer())
        .post('/api/v1/webhooks/stripe')
        .set('stripe-signature', 'valid_stripe_signature')
        .send(JSON.stringify(eventPayload))
        .expect(200);

      expect(firstRes.body.received).toBe(true);

      // Second delivery (replay attack / duplicate network delivery)
      const secondRes = await request(app.getHttpServer())
        .post('/api/v1/webhooks/stripe')
        .set('stripe-signature', 'valid_stripe_signature')
        .send(JSON.stringify(eventPayload))
        .expect(200);

      expect(secondRes.body).toEqual({
        received: true,
        status: 'already_processed',
      });
    });
  });
});
