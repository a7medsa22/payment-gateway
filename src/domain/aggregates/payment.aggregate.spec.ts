import { Payment } from './payment.aggregate';
import { Money } from '@domain/value-objects/money.vo';
import { Clock } from '@domain/clock';
import {
  FailureReason,
  PaymentProvider,
  PaymentStatus,
  TransactionStatus,
  TransactionType,
} from '@domain/enums';
import { DomainException } from '@domain/exceptions/domain.exception';

describe('Payment Aggregate', () => {
  const fixedDate = new Date('2025-01-01T00:00:00Z');
  const fixedClock: Clock = { now: () => fixedDate };

  function createTestPayment(overrides?: Record<string, unknown>): Payment {
    return Payment.create(
      {
        id: 'pay_test_123',
        userId: 'user_test_456',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
        description: 'Test payment',
        ...overrides,
      },
      fixedClock,
    );
  }

  describe('Creation', () => {
    it('should create a payment in CREATED status with empty transactions', () => {
      const payment = createTestPayment();

      expect(payment.id).toBe('pay_test_123');
      expect(payment.userId).toBe('user_test_456');
      expect(payment.amount.amount).toBe('100.0000');
      expect(payment.provider).toBe(PaymentProvider.STRIPE);
      expect(payment.status).toBe(PaymentStatus.CREATED);
      expect(payment.transactions).toEqual([]);
      expect(payment.createdAt).toEqual(fixedDate);
      expect(payment.updatedAt).toEqual(fixedDate);
    });

    it('should throw DomainException if userId is missing', () => {
      expect(() =>
        Payment.create(
          {
            id: 'pay_1',
            userId: '',
            amount: Money.from('10.00', 'USD'),
            provider: PaymentProvider.STRIPE,
          },
          fixedClock,
        ),
      ).toThrow(DomainException);
    });

    it('should throw DomainException if provider is missing', () => {
      expect(() =>
        Payment.create(
          {
            id: 'pay_1',
            userId: 'user_1',
            amount: Money.from('10.00', 'USD'),
            provider: undefined as unknown as PaymentProvider,
          },
          fixedClock,
        ),
      ).toThrow(DomainException);
    });
  });

  describe('start() State Transition', () => {
    it('should transition from CREATED to PENDING', () => {
      const payment = createTestPayment();
      payment.start();

      expect(payment.status).toBe(PaymentStatus.PENDING);
    });

    it('should throw when calling start() on a non-CREATED payment', () => {
      const payment = createTestPayment();
      payment.start(); // now PENDING

      expect(() => payment.start()).toThrow('Payment already started');
    });
  });

  describe('process() State Transition', () => {
    it('should transition from PENDING to PROCESSING', () => {
      const payment = createTestPayment();
      payment.start();
      payment.process();

      expect(payment.status).toBe(PaymentStatus.PROCESSING);
    });

    it('should throw when calling process() on CREATED payment', () => {
      const payment = createTestPayment();
      expect(() => payment.process()).toThrow(
        'Payment must be pending to be processed',
      );
    });
  });

  describe('succeed() State Transition & Child Transaction Management', () => {
    it('should transition from PENDING to SUCCEEDED and create charge transaction', () => {
      const payment = createTestPayment();
      payment.start();
      payment.succeed('ch_stripe_123');

      expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
      expect(payment.succeededAt).toEqual(fixedDate);
      expect(payment.transactions).toHaveLength(1);

      const txn = payment.transactions[0];
      expect(txn.paymentId).toBe(payment.id);
      expect(txn.type).toBe(TransactionType.CHARGE);
      expect(txn.status).toBe(TransactionStatus.SUCCEEDED);
      expect(txn.amount.equals(payment.amount)).toBe(true);
      expect(txn.provider).toBe(PaymentProvider.STRIPE);
      expect(txn.providerTransactionId).toBe('ch_stripe_123');

      expect(payment.totalCharged.equals(payment.amount)).toBe(true);
    });

    it('should transition from PROCESSING to SUCCEEDED', () => {
      const payment = createTestPayment();
      payment.start();
      payment.process();
      payment.succeed();

      expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
      expect(payment.transactions).toHaveLength(1);
    });

    it('should throw when calling succeed() from CREATED status', () => {
      const payment = createTestPayment();
      expect(() => payment.succeed()).toThrow(
        'Cannot mark payment as succeed from status: created',
      );
    });
  });

  describe('fail() State Transition', () => {
    it('should transition from PENDING to FAILED with error details', () => {
      const payment = createTestPayment();
      payment.start();
      payment.fail('card_declined', FailureReason.CARD_DECLINED);

      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(payment.errorCode).toBe('card_declined');
      expect(payment.failureReason).toBe(FailureReason.CARD_DECLINED);
      expect(payment.failedAt).toEqual(fixedDate);
    });

    it('should throw when calling fail() from CREATED status', () => {
      const payment = createTestPayment();
      expect(() => payment.fail('err', FailureReason.UNKNOWN)).toThrow(
        'Cannot mark payment as fail from status: created',
      );
    });
  });

  describe('cancel() State Transition', () => {
    it('should transition from CREATED, PENDING, or PROCESSING to CANCELLED', () => {
      const payment1 = createTestPayment();
      payment1.cancel('user_cancel', FailureReason.INVALID_REQUEST);
      expect(payment1.status).toBe(PaymentStatus.CANCELLED);
      expect(payment1.cancelledAt).toEqual(fixedDate);

      const payment2 = createTestPayment();
      payment2.start();
      payment2.cancel('user_cancel', FailureReason.INVALID_REQUEST);
      expect(payment2.status).toBe(PaymentStatus.CANCELLED);
    });

    it('should throw when cancelling a SUCCEEDED payment', () => {
      const payment = createTestPayment();
      payment.start();
      payment.succeed();

      expect(() =>
        payment.cancel('cancel', FailureReason.INVALID_REQUEST),
      ).toThrow('Cannot mark payment as cancel from status: succeeded');
    });
  });

  describe('expire() State Transition', () => {
    it('should transition from PENDING to EXPIRED', () => {
      const payment = createTestPayment();
      payment.start();
      payment.expire('timeout', FailureReason.UNKNOWN);

      expect(payment.status).toBe(PaymentStatus.EXPIRED);
      expect(payment.expiredAt).toEqual(fixedDate);
    });

    it('should throw when expiring a SUCCEEDED payment', () => {
      const payment = createTestPayment();
      payment.start();
      payment.succeed();

      expect(() => payment.expire('timeout', FailureReason.UNKNOWN)).toThrow(
        'Cannot mark payment as expire from status: succeeded',
      );
    });
  });

  describe('Reconstitution', () => {
    it('should reconstitute a payment aggregate correctly', () => {
      const payment = Payment.reconstitute(
        {
          id: 'pay_recon_1',
          userId: 'user_1',
          amount: Money.from('250.00', 'EUR'),
          status: PaymentStatus.SUCCEEDED,
          provider: PaymentProvider.PAYMOB,
          createdAt: fixedDate,
          updatedAt: fixedDate,
        },
        fixedClock,
      );

      expect(payment.id).toBe('pay_recon_1');
      expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
      expect(payment.provider).toBe(PaymentProvider.PAYMOB);
      expect(payment.amount.currency).toBe('EUR');
    });
  });

  describe('Encapsulation & Immutability', () => {
    it('should return a defensive copy of transactions', () => {
      const payment = createTestPayment();
      payment.start();
      payment.succeed();

      const txns = payment.transactions as Array<unknown>;
      expect(txns).toHaveLength(1);

      // Attempting to mutate returned array shouldn't affect internal aggregate state
      txns.push('fake');
      expect(payment.transactions).toHaveLength(1);
    });
  });
});
