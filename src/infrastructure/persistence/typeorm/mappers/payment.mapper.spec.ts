import { PaymentMapper } from './payment.mapper';
import { Payment } from '@domain/aggregates/payment.aggregate';
import { Money } from '@domain/value-objects/money.vo';
import {
  FailureReason,
  PaymentProvider,
  PaymentStatus,
  TransactionStatus,
  TransactionType,
} from '@domain/enums';
import { PaymentSchema } from '../schemas/payment.schema';
import { TransactionSchema } from '../schemas/transaction.schema';

describe('PaymentMapper', () => {
  const fixedDate = new Date('2025-01-01T12:00:00.000Z');

  describe('toPersistence', () => {
    it('should correctly map a Payment aggregate with transactions to persistence schemas', () => {
      const payment = Payment.create(
        {
          id: 'pay-123',
          userId: 'user-456',
          amount: Money.from('150.50', 'USD'),
          provider: PaymentProvider.STRIPE,
          providerPaymentId: 'pi_stripe_789',
          paymentMethodType: 'card',
          description: 'Order #1001',
        },
        { now: () => fixedDate },
      );
      payment.start();
      payment.succeed('ch_stripe_789');
      payment.refund(Money.from('50.00', 'USD'), 'Partial customer refund');

      const { paymentSchema, transactionSchemas } =
        PaymentMapper.toPersistence(payment);

      expect(paymentSchema.id).toBe('pay-123');
      expect(paymentSchema.userId).toBe('user-456');
      expect(paymentSchema.amount).toBe('150.5000');
      expect(paymentSchema.currency).toBe('USD');
      expect(paymentSchema.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
      expect(paymentSchema.provider).toBe(PaymentProvider.STRIPE);
      expect(paymentSchema.providerPaymentId).toBe('pi_stripe_789');
      expect(paymentSchema.paymentMethodType).toBe('card');
      expect(paymentSchema.description).toBe('Order #1001');
      expect(paymentSchema.succeededAt).toEqual(fixedDate);
      expect(paymentSchema.transactions).toBeUndefined(); // Crucial: explicitly unnested

      expect(transactionSchemas).toHaveLength(2);

      // First transaction: CHARGE
      expect(transactionSchemas[0].paymentId).toBe('pay-123');
      expect(transactionSchemas[0].type).toBe(TransactionType.CHARGE);
      expect(transactionSchemas[0].status).toBe(TransactionStatus.SUCCEEDED);
      expect(transactionSchemas[0].amount).toBe('150.5000');
      expect(transactionSchemas[0].currency).toBe('USD');
      expect(transactionSchemas[0].provider).toBe(PaymentProvider.STRIPE);
      expect(transactionSchemas[0].providerTransactionId).toBe('ch_stripe_789');

      // Second transaction: PARTIAL_REFUND
      expect(transactionSchemas[1].paymentId).toBe('pay-123');
      expect(transactionSchemas[1].type).toBe(TransactionType.PARTIAL_REFUND);
      expect(transactionSchemas[1].status).toBe(TransactionStatus.SUCCEEDED);
      expect(transactionSchemas[1].amount).toBe('50.0000');
      expect(transactionSchemas[1].currency).toBe('USD');
      expect(transactionSchemas[1].provider).toBe(PaymentProvider.STRIPE);
      expect(transactionSchemas[1].description).toBe('Partial customer refund');
    });
  });

  describe('toDomain', () => {
    it('should correctly reconstruct a Payment aggregate from schemas', () => {
      const paymentSchema = new PaymentSchema();
      paymentSchema.id = 'pay-999';
      paymentSchema.userId = 'user-888';
      paymentSchema.amount = '200.0000';
      paymentSchema.currency = 'EUR';
      paymentSchema.status = PaymentStatus.SUCCEEDED;
      paymentSchema.provider = PaymentProvider.PAYMOB;
      paymentSchema.providerPaymentId = 'paymob_order_123';
      paymentSchema.paymentMethodType = 'wallet';
      paymentSchema.description = 'Test wallet payment';
      paymentSchema.succeededAt = fixedDate;
      paymentSchema.createdAt = fixedDate;
      paymentSchema.updatedAt = fixedDate;
      paymentSchema.version = 2;

      const txSchema = new TransactionSchema();
      txSchema.id = 'tx-111';
      txSchema.paymentId = 'pay-999';
      txSchema.type = TransactionType.CHARGE;
      txSchema.status = TransactionStatus.SUCCEEDED;
      txSchema.amount = '200.0000';
      txSchema.currency = 'EUR';
      txSchema.provider = PaymentProvider.PAYMOB;
      txSchema.providerTransactionId = 'paymob_tx_456';
      txSchema.description = 'Payment charge';
      txSchema.processedAt = fixedDate;
      txSchema.createdAt = fixedDate;

      const payment = PaymentMapper.toDomain(paymentSchema, [txSchema]);

      expect(payment.id).toBe('pay-999');
      expect(payment.userId).toBe('user-888');
      expect(payment.amount.amount).toBe('200.0000');
      expect(payment.amount.currency).toBe('EUR');
      expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
      expect(payment.provider).toBe(PaymentProvider.PAYMOB);
      expect(payment.providerPaymentId).toBe('paymob_order_123');
      expect(payment.succeededAt).toEqual(fixedDate);
      expect(payment.transactions).toHaveLength(1);
      expect(payment.transactions[0].id).toBe('tx-111');
      expect(payment.totalCharged.amount).toBe('200.0000');
    });

    it('should handle optional timestamps and failure fields gracefully', () => {
      const paymentSchema = new PaymentSchema();
      paymentSchema.id = 'pay-fail';
      paymentSchema.userId = 'user-1';
      paymentSchema.amount = '50.0000';
      paymentSchema.currency = 'USD';
      paymentSchema.status = PaymentStatus.FAILED;
      paymentSchema.provider = PaymentProvider.STRIPE;
      paymentSchema.errorCode = 'card_declined';
      paymentSchema.failureReason = FailureReason.CARD_DECLINED;
      paymentSchema.failedAt = fixedDate;
      paymentSchema.createdAt = fixedDate;
      paymentSchema.updatedAt = fixedDate;

      const payment = PaymentMapper.toDomain(paymentSchema, []);

      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(payment.errorCode).toBe('card_declined');
      expect(payment.failureReason).toBe(FailureReason.CARD_DECLINED);
      expect(payment.failedAt).toEqual(fixedDate);
      expect(payment.succeededAt).toBeUndefined();
      expect(payment.refundedAt).toBeUndefined();
    });
  });

  describe('Round-Trip Fidelity', () => {
    it('should preserve all domain aggregate properties across domain -> persistence -> domain', () => {
      const originalPayment = Payment.create({
        id: 'pay-roundtrip-1',
        userId: 'user-rt',
        amount: Money.from('350.75', 'USD'),
        provider: PaymentProvider.STRIPE,
        description: 'Roundtrip test',
      });
      originalPayment.start();
      originalPayment.succeed('ch_stripe_rt');
      originalPayment.refund(Money.from('100.00', 'USD'), 'Customer refund');

      const { paymentSchema, transactionSchemas } =
        PaymentMapper.toPersistence(originalPayment);

      const reconstructedPayment = PaymentMapper.toDomain(
        paymentSchema,
        transactionSchemas,
      );

      expect(reconstructedPayment.id).toBe(originalPayment.id);
      expect(reconstructedPayment.userId).toBe(originalPayment.userId);
      expect(reconstructedPayment.amount.equals(originalPayment.amount)).toBe(
        true,
      );
      expect(reconstructedPayment.status).toBe(originalPayment.status);
      expect(reconstructedPayment.provider).toBe(originalPayment.provider);
      expect(reconstructedPayment.description).toBe(
        originalPayment.description,
      );
      expect(reconstructedPayment.transactions).toHaveLength(
        originalPayment.transactions.length,
      );
      expect(
        reconstructedPayment.totalCharged.equals(
          originalPayment.totalCharged,
        ),
      ).toBe(true);
      expect(
        reconstructedPayment.totalRefunded.equals(
          originalPayment.totalRefunded,
        ),
      ).toBe(true);
      expect(
        reconstructedPayment.refundableAmount.equals(
          originalPayment.refundableAmount,
        ),
      ).toBe(true);
    });
  });
});
