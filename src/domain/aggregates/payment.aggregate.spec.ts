import { Payment } from './payment.aggregate';
import { Money } from '@domain/value-objects/money.vo';
import { Clock } from '@domain/clock';
import {
  Currency,
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

  describe('refund() State Transitions, Invariants & Business Rules', () => {
    function createSucceededPayment(
      amount = '100.00',
      currency: Currency = 'USD',
    ): Payment {
      const payment = Payment.create(
        {
          id: 'pay_succ_1',
          userId: 'user_1',
          amount: Money.from(amount, currency),
          provider: PaymentProvider.STRIPE,
        },
        fixedClock,
      );
      payment.start();
      payment.succeed('ch_123');
      return payment;
    }

    // Full Refund (Cases 1-7)
    it('Case 1: should successfully execute a full refund when no amount is specified (defaults to refundableAmount)', () => {
      const payment = createSucceededPayment();
      payment.refund();

      expect(payment.status).toBe(PaymentStatus.REFUNDED);
      expect(payment.totalRefunded.equals(Money.from('100.00', 'USD'))).toBe(true);
      expect(payment.refundableAmount.equals(Money.zero('USD'))).toBe(true);
    });

    it('Case 2: should successfully execute an explicit full refund (amount === totalCharged)', () => {
      const payment = createSucceededPayment();
      payment.refund(Money.from('100.00', 'USD'));

      expect(payment.status).toBe(PaymentStatus.REFUNDED);
      expect(payment.totalRefunded.equals(Money.from('100.00', 'USD'))).toBe(true);
    });

    it('Case 3: should transition status from SUCCEEDED to REFUNDED on full refund', () => {
      const payment = createSucceededPayment();
      expect(payment.status).toBe(PaymentStatus.SUCCEEDED);

      payment.refund();
      expect(payment.status).toBe(PaymentStatus.REFUNDED);
    });

    it('Case 4: should set refundedAt timestamp on full refund', () => {
      const payment = createSucceededPayment();
      expect(payment.refundedAt).toBeUndefined();

      payment.refund();
      expect(payment.refundedAt).toEqual(fixedDate);
    });

    it('Case 5: should update updatedAt timestamp on refund', () => {
      let currentTime = new Date('2025-01-01T00:00:00Z');
      const dynamicClock: Clock = { now: () => currentTime };

      const payment = Payment.create(
        {
          id: 'pay_dyn_1',
          userId: 'user_1',
          amount: Money.from('100.00', 'USD'),
          provider: PaymentProvider.STRIPE,
        },
        dynamicClock,
      );
      payment.start();
      payment.succeed('ch_123');

      currentTime = new Date('2025-01-02T10:00:00Z');
      payment.refund(undefined, 'Customer request');

      expect(payment.updatedAt).toEqual(currentTime);
      expect(payment.refundedAt).toEqual(currentTime);
    });

    it('Case 6: should create a child Transaction of type REFUND and status SUCCEEDED on full refund', () => {
      const payment = createSucceededPayment();
      payment.refund();

      expect(payment.transactions).toHaveLength(2); // 1 charge + 1 refund
      const refundTx = payment.transactions[1];
      expect(refundTx.type).toBe(TransactionType.REFUND);
      expect(refundTx.status).toBe(TransactionStatus.SUCCEEDED);
      expect(refundTx.paymentId).toBe(payment.id);
    });

    it('Case 7: should record correct amount, provider, and description on the refund transaction', () => {
      const payment = createSucceededPayment();
      payment.refund(Money.from('100.00', 'USD'));

      const refundTx = payment.transactions[1];
      expect(refundTx.amount.equals(Money.from('100.00', 'USD'))).toBe(true);
      expect(refundTx.provider).toBe(PaymentProvider.STRIPE);
      expect(refundTx.description).toBe('Full refund');
    });

    // Partial Refund (Cases 8-16)
    it('Case 8: should successfully execute a partial refund (amount < refundableAmount)', () => {
      const payment = createSucceededPayment();
      payment.refund(Money.from('40.00', 'USD'));

      expect(payment.totalRefunded.equals(Money.from('40.00', 'USD'))).toBe(true);
      expect(payment.refundableAmount.equals(Money.from('60.00', 'USD'))).toBe(true);
    });

    it('Case 9: should transition status from SUCCEEDED to PARTIALLY_REFUNDED on partial refund', () => {
      const payment = createSucceededPayment();
      payment.refund(Money.from('40.00', 'USD'));

      expect(payment.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    });

    it('Case 10: should NOT set refundedAt on partial refund (remains undefined)', () => {
      const payment = createSucceededPayment();
      payment.refund(Money.from('40.00', 'USD'));

      expect(payment.refundedAt).toBeUndefined();
    });

    it('Case 11: should create a child Transaction of type PARTIAL_REFUND on partial refund', () => {
      const payment = createSucceededPayment();
      payment.refund(Money.from('40.00', 'USD'));

      expect(payment.transactions).toHaveLength(2);
      const refundTx = payment.transactions[1];
      expect(refundTx.type).toBe(TransactionType.PARTIAL_REFUND);
      expect(refundTx.status).toBe(TransactionStatus.SUCCEEDED);
      expect(refundTx.amount.equals(Money.from('40.00', 'USD'))).toBe(true);
      expect(refundTx.description).toBe('Partial refund');
    });

    it('Case 12: should allow multiple sequential partial refunds until fully refunded', () => {
      const payment = createSucceededPayment();

      payment.refund(Money.from('30.00', 'USD'));
      expect(payment.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
      expect(payment.refundableAmount.equals(Money.from('70.00', 'USD'))).toBe(true);

      payment.refund(Money.from('50.00', 'USD'));
      expect(payment.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
      expect(payment.refundableAmount.equals(Money.from('20.00', 'USD'))).toBe(true);

      payment.refund(Money.from('20.00', 'USD'));
      expect(payment.status).toBe(PaymentStatus.REFUNDED);
      expect(payment.refundableAmount.equals(Money.zero('USD'))).toBe(true);
      expect(payment.transactions).toHaveLength(4); // 1 charge + 3 refunds
    });

    it('Case 13: should transition from PARTIALLY_REFUNDED to REFUNDED when the final partial refund exhausts refundableAmount', () => {
      const payment = createSucceededPayment();
      payment.refund(Money.from('60.00', 'USD'));
      expect(payment.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);

      payment.refund(Money.from('40.00', 'USD'));
      expect(payment.status).toBe(PaymentStatus.REFUNDED);
    });

    it('Case 14: should set refundedAt when the final partial refund completes full refund', () => {
      const payment = createSucceededPayment();
      payment.refund(Money.from('60.00', 'USD'));
      expect(payment.refundedAt).toBeUndefined();

      payment.refund(Money.from('40.00', 'USD'));
      expect(payment.refundedAt).toEqual(fixedDate);
    });

    it('Case 15: should correctly track totalRefunded across multiple partial refunds', () => {
      const payment = createSucceededPayment();
      payment.refund(Money.from('25.00', 'USD'));
      expect(payment.totalRefunded.equals(Money.from('25.00', 'USD'))).toBe(true);

      payment.refund(Money.from('25.00', 'USD'));
      expect(payment.totalRefunded.equals(Money.from('50.00', 'USD'))).toBe(true);

      payment.refund(Money.from('25.00', 'USD'));
      expect(payment.totalRefunded.equals(Money.from('75.00', 'USD'))).toBe(true);
    });

    it('Case 16: should correctly track refundableAmount decreasing after each partial refund', () => {
      const payment = createSucceededPayment();
      expect(payment.refundableAmount.equals(Money.from('100.00', 'USD'))).toBe(true);

      payment.refund(Money.from('15.50', 'USD'));
      expect(payment.refundableAmount.equals(Money.from('84.50', 'USD'))).toBe(true);

      payment.refund(Money.from('34.50', 'USD'));
      expect(payment.refundableAmount.equals(Money.from('50.00', 'USD'))).toBe(true);
    });

    // Guard / Invariant / Validation Tests (Cases 17-28)
    it('Case 17: should throw DomainException when refunding a CREATED payment', () => {
      const payment = createTestPayment();
      expect(() => payment.refund()).toThrow(DomainException);
      expect(() => payment.refund()).toThrow('Cannot refund payment from status: created');
    });

    it('Case 18: should throw DomainException when refunding a PENDING payment', () => {
      const payment = createTestPayment();
      payment.start();
      expect(() => payment.refund()).toThrow(DomainException);
      expect(() => payment.refund()).toThrow('Cannot refund payment from status: pending');
    });

    it('Case 19: should throw DomainException when refunding a PROCESSING payment', () => {
      const payment = createTestPayment();
      payment.start();
      payment.process();
      expect(() => payment.refund()).toThrow(DomainException);
      expect(() => payment.refund()).toThrow('Cannot refund payment from status: processing');
    });

    it('Case 20: should throw DomainException when refunding a FAILED payment', () => {
      const payment = createTestPayment();
      payment.start();
      payment.fail('card_declined', FailureReason.CARD_DECLINED);
      expect(() => payment.refund()).toThrow(DomainException);
      expect(() => payment.refund()).toThrow('Cannot refund payment from status: failed');
    });

    it('Case 21: should throw DomainException when refunding a CANCELLED payment', () => {
      const payment = createTestPayment();
      payment.cancel('user_cancel', FailureReason.INVALID_REQUEST);
      expect(() => payment.refund()).toThrow(DomainException);
      expect(() => payment.refund()).toThrow('Cannot refund payment from status: cancelled');
    });

    it('Case 22: should throw DomainException when refunding an EXPIRED payment', () => {
      const payment = createTestPayment();
      payment.expire('timeout', FailureReason.UNKNOWN);
      expect(() => payment.refund()).toThrow(DomainException);
      expect(() => payment.refund()).toThrow('Cannot refund payment from status: expired');
    });

    it('Case 23: should throw DomainException when refunding an already fully REFUNDED payment (refundableAmount is zero)', () => {
      const payment = createSucceededPayment();
      payment.refund(); // Fully refunded
      expect(payment.status).toBe(PaymentStatus.REFUNDED);

      expect(() => payment.refund()).toThrow(DomainException);
      expect(() => payment.refund()).toThrow('Cannot refund payment from status: refunded');
    });

    it('Case 24: should throw DomainException when refund amount exceeds refundableAmount on a SUCCEEDED payment', () => {
      const payment = createSucceededPayment();
      expect(() => payment.refund(Money.from('100.01', 'USD'))).toThrow(DomainException);
      expect(() => payment.refund(Money.from('100.01', 'USD'))).toThrow('exceeds refundable amount');
    });

    it('Case 25: should throw DomainException when refund amount exceeds remaining refundableAmount on a PARTIALLY_REFUNDED payment', () => {
      const payment = createSucceededPayment();
      payment.refund(Money.from('60.00', 'USD'));
      expect(payment.refundableAmount.equals(Money.from('40.00', 'USD'))).toBe(true);

      expect(() => payment.refund(Money.from('40.01', 'USD'))).toThrow(DomainException);
      expect(() => payment.refund(Money.from('40.01', 'USD'))).toThrow('exceeds refundable amount');
    });

    it('Case 26: should throw DomainException when refund amount is zero or negative', () => {
      const payment = createSucceededPayment();
      expect(() => payment.refund(Money.zero('USD'))).toThrow(DomainException);
      expect(() => payment.refund(Money.zero('USD'))).toThrow('Refund amount must be positive');
    });

    it('Case 27: should throw DomainException when refund currency does not match payment currency', () => {
      const payment = createSucceededPayment('100.00', 'USD');
      expect(() => payment.refund(Money.from('50.00', 'EUR'))).toThrow(DomainException);
      expect(() => payment.refund(Money.from('50.00', 'EUR'))).toThrow('Refund currency mismatch');
    });

    it('Case 28: should use custom refund reason in transaction description when provided', () => {
      const payment = createSucceededPayment();
      payment.refund(Money.from('50.00', 'USD'), 'Duplicate order by customer');

      const refundTx = payment.transactions[1];
      expect(refundTx.description).toBe('Duplicate order by customer');
    });
  });
});
