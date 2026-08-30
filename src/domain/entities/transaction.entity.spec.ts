import { Transaction } from './transaction.entity';
import { Money } from '@domain/value-objects/money.vo';
import { Clock } from '@domain/clock';
import {
  PaymentProvider,
  TransactionStatus,
  TransactionType,
} from '@domain/enums';
import { DomainException } from '@domain/exceptions/domain.exception';

describe('Transaction Entity', () => {
  const fixedDate = new Date('2025-01-01T00:00:00Z');
  const fixedClock: Clock = { now: () => fixedDate };

  function createTestTransaction(overrides?: Record<string, unknown>): Transaction {
    return Transaction.createInternal(
      {
        id: 'txn_123',
        paymentId: 'pay_456',
        type: TransactionType.CHARGE,
        status: TransactionStatus.PENDING,
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
        description: 'Test transaction',
        ...overrides,
      },
      fixedClock,
    );
  }

  describe('Creation and Invariants', () => {
    it('should create internal transaction with correct properties', () => {
      const txn = createTestTransaction();

      expect(txn.id).toBe('txn_123');
      expect(txn.paymentId).toBe('pay_456');
      expect(txn.type).toBe(TransactionType.CHARGE);
      expect(txn.status).toBe(TransactionStatus.PENDING);
      expect(txn.amount.amount).toBe('100.0000');
      expect(txn.provider).toBe(PaymentProvider.STRIPE);
      expect(txn.createdAt).toEqual(fixedDate);
    });

    it('should throw DomainException if id is missing', () => {
      expect(() =>
        Transaction.createInternal(
          {
            id: '',
            paymentId: 'pay_1',
            type: TransactionType.CHARGE,
            status: TransactionStatus.PENDING,
            amount: Money.from('10.00', 'USD'),
            provider: PaymentProvider.STRIPE,
          },
          fixedClock,
        ),
      ).toThrow(DomainException);
    });

    it('should throw DomainException if paymentId is missing', () => {
      expect(() =>
        Transaction.createInternal(
          {
            id: 'txn_1',
            paymentId: '',
            type: TransactionType.CHARGE,
            status: TransactionStatus.PENDING,
            amount: Money.from('10.00', 'USD'),
            provider: PaymentProvider.STRIPE,
          },
          fixedClock,
        ),
      ).toThrow('Transaction must belong to a payment');
    });
  });

  describe('State Transitions', () => {
    it('should mark pending transaction as processing', () => {
      const txn = createTestTransaction();
      txn.markAsProcessing();

      expect(txn.status).toBe(TransactionStatus.PROCESSING);
    });

    it('should throw when marking non-pending transaction as processing', () => {
      const txn = createTestTransaction({ status: TransactionStatus.SUCCEEDED });
      expect(() => txn.markAsProcessing()).toThrow(
        'Transaction must be pending to be processed',
      );
    });

    it('should mark pending or processing transaction as succeeded', () => {
      const txn = createTestTransaction({ status: TransactionStatus.PROCESSING });
      txn.markAsSucceeded(fixedClock);

      expect(txn.status).toBe(TransactionStatus.SUCCEEDED);
      expect(txn.processedAt).toEqual(fixedDate);
      expect(txn.isSuccessful()).toBe(true);
    });

    it('should be idempotent when calling markAsSucceeded on SUCCEEDED transaction', () => {
      const txn = createTestTransaction({ status: TransactionStatus.SUCCEEDED });
      txn.markAsSucceeded(fixedClock);

      expect(txn.status).toBe(TransactionStatus.SUCCEEDED);
    });

    it('should mark processing transaction as failed', () => {
      const txn = createTestTransaction({ status: TransactionStatus.PROCESSING });
      txn.markAsFailed(fixedClock);

      expect(txn.status).toBe(TransactionStatus.FAILED);
      expect(txn.processedAt).toEqual(fixedDate);
      expect(txn.isFailed()).toBe(true);
    });

    it('should throw when marking non-processing transaction as failed', () => {
      const txn = createTestTransaction({ status: TransactionStatus.PENDING });
      expect(() => txn.markAsFailed(fixedClock)).toThrow(
        'Transaction must be processing to be failed',
      );
    });
  });

  describe('Query Methods', () => {
    it('should correctly identify refund transactions', () => {
      const chargeTxn = createTestTransaction({ type: TransactionType.CHARGE });
      const refundTxn = createTestTransaction({ type: TransactionType.REFUND });
      const partialRefundTxn = createTestTransaction({
        type: TransactionType.PARTIAL_REFUND,
      });

      expect(chargeTxn.isRefund()).toBe(false);
      expect(refundTxn.isRefund()).toBe(true);
      expect(partialRefundTxn.isRefund()).toBe(true);
    });
  });

  describe('Reconstitution & Serialization', () => {
    it('should reconstitute from props', () => {
      const txn = Transaction.reconstitute(
        {
          id: 'txn_recon_1',
          paymentId: 'pay_recon_1',
          type: TransactionType.CHARGE,
          status: TransactionStatus.SUCCEEDED,
          amount: Money.from('50.00', 'USD'),
          provider: PaymentProvider.STRIPE,
          processedAt: fixedDate,
        },
        fixedClock,
      );

      expect(txn.id).toBe('txn_recon_1');
      expect(txn.status).toBe(TransactionStatus.SUCCEEDED);
    });

    it('should serialize to JSON properly', () => {
      const txn = createTestTransaction();
      const json = txn.toJson();

      expect(json.id).toBe('txn_123');
      expect(json.paymentId).toBe('pay_456');
      expect(json.amount).toEqual({ amount: '100.0000', currency: 'USD' });
      expect(json.type).toBe(TransactionType.CHARGE);
    });
  });
});
