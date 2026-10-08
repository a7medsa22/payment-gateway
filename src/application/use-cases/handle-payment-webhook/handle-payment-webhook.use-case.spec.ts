import { HandlePaymentWebhookUseCase } from './handle-payment-webhook.use-case';
import { PaymentRepository } from '@application/ports/payment.repository';
import { WebhookEventRepository } from '@application/ports/webhook-event.repository';
import { ProviderWebhookEvent } from '@application/ports/provider-webhook-event';
import { Payment } from '@domain/aggregates/payment.aggregate';
import { Money } from '@domain/value-objects/money.vo';
import { PaymentProvider, PaymentStatus, FailureReason } from '@domain/enums';

describe('HandlePaymentWebhookUseCase', () => {
  let useCase: HandlePaymentWebhookUseCase;
  let mockPaymentRepo: jest.Mocked<PaymentRepository>;
  let mockWebhookEventRepo: jest.Mocked<WebhookEventRepository>;

  beforeEach(() => {
    mockPaymentRepo = {
      findById: jest.fn().mockResolvedValue(null),
      findByProviderPaymentId: jest.fn().mockResolvedValue(null),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };

    mockWebhookEventRepo = {
      claim: jest.fn().mockResolvedValue('new'),
      markProcessed: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markRequiresReview: jest.fn().mockResolvedValue(undefined),
    };

    useCase = new HandlePaymentWebhookUseCase(
      mockPaymentRepo,
      mockWebhookEventRepo,
    );
  });

  describe('payment.succeeded', () => {
    it('should transition PENDING payment to SUCCEEDED and mark event processed', async () => {
      const payment = Payment.create({
        id: 'pay-1',
        merchantId: 'merchant-1',
        userId: 'user-1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });
      payment.start();

      mockPaymentRepo.findById.mockResolvedValue(payment);

      const event: ProviderWebhookEvent = {
        kind: 'payment.succeeded',
        eventId: 'evt-succeed-1',
        paymentId: 'pay-1',
        providerPaymentId: 'pi_123',
        amountMinor: 10000,
        currency: 'usd',
      };

      const result = await useCase.execute('STRIPE', event);

      expect(result).toBe('succeeded');
      expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
      expect(payment.providerPaymentId).toBe('pi_123');
      expect(mockPaymentRepo.save).toHaveBeenCalledWith(payment);
      expect(mockWebhookEventRepo.markProcessed).toHaveBeenCalledWith(
        'STRIPE',
        'evt-succeed-1',
      );
    });

    it('should return already_succeeded when payment is already SUCCEEDED', async () => {
      const payment = Payment.create({
        id: 'pay-already',
        merchantId: 'merchant-1',
        userId: 'user-1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });
      payment.start();
      payment.succeed('pi_already');

      mockPaymentRepo.findById.mockResolvedValue(payment);

      const event: ProviderWebhookEvent = {
        kind: 'payment.succeeded',
        eventId: 'evt-already',
        paymentId: 'pay-already',
        providerPaymentId: 'pi_already',
        amountMinor: 10000,
        currency: 'usd',
      };

      const result = await useCase.execute('STRIPE', event);

      expect(result).toBe('already_succeeded');
      expect(mockPaymentRepo.save).not.toHaveBeenCalled();
      expect(mockWebhookEventRepo.markProcessed).toHaveBeenCalledWith(
        'STRIPE',
        'evt-already',
      );
    });

    it('should return payment_not_found if payment cannot be located', async () => {
      mockPaymentRepo.findById.mockResolvedValue(null);
      mockPaymentRepo.findByProviderPaymentId.mockResolvedValue(null);

      const event: ProviderWebhookEvent = {
        kind: 'payment.succeeded',
        eventId: 'evt-missing',
        paymentId: 'pay-missing',
        providerPaymentId: 'pi_missing',
        amountMinor: 5000,
        currency: 'usd',
      };

      const result = await useCase.execute('STRIPE', event);

      expect(result).toBe('payment_not_found');
      expect(mockWebhookEventRepo.markProcessed).toHaveBeenCalledWith(
        'STRIPE',
        'evt-missing',
      );
    });

    it('should mark requires_review if amount or currency does not match', async () => {
      const payment = Payment.create({
        id: 'pay-mismatch',
        merchantId: 'merchant-1',
        userId: 'user-1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });
      payment.start();

      mockPaymentRepo.findById.mockResolvedValue(payment);

      const event: ProviderWebhookEvent = {
        kind: 'payment.succeeded',
        eventId: 'evt-mismatch',
        paymentId: 'pay-mismatch',
        providerPaymentId: 'pi_mismatch',
        amountMinor: 5000, // Expected 10000
        currency: 'usd',
      };

      const result = await useCase.execute('STRIPE', event);

      expect(result).toBe('requires_review');
      expect(mockWebhookEventRepo.markRequiresReview).toHaveBeenCalledWith(
        'STRIPE',
        'evt-mismatch',
        'amount_or_intent_mismatch',
      );
      expect(payment.status).toBe(PaymentStatus.PENDING);
    });

    it('should mark requires_review when charge succeeds on terminal payment (FAILED)', async () => {
      const payment = Payment.create({
        id: 'pay-terminal',
        merchantId: 'merchant-1',
        userId: 'user-1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });
      payment.start();
      payment.fail('card_declined', FailureReason.PROVIDER_ERROR);

      mockPaymentRepo.findById.mockResolvedValue(payment);

      const event: ProviderWebhookEvent = {
        kind: 'payment.succeeded',
        eventId: 'evt-terminal',
        paymentId: 'pay-terminal',
        providerPaymentId: 'pi_terminal',
        amountMinor: 10000,
        currency: 'usd',
      };

      const result = await useCase.execute('STRIPE', event);

      expect(result).toBe('requires_review');
      expect(mockWebhookEventRepo.markRequiresReview).toHaveBeenCalledWith(
        'STRIPE',
        'evt-terminal',
        `succeeded_on_${payment.status}`,
      );
    });
  });

  describe('payment.failed', () => {
    it('should transition PENDING payment to FAILED with error code', async () => {
      const payment = Payment.create({
        id: 'pay-fail',
        merchantId: 'merchant-1',
        userId: 'user-1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });
      payment.start();

      mockPaymentRepo.findById.mockResolvedValue(payment);

      const event: ProviderWebhookEvent = {
        kind: 'payment.failed',
        eventId: 'evt-fail-1',
        paymentId: 'pay-fail',
        providerPaymentId: 'pi_fail',
        errorCode: 'insufficient_funds',
      };

      const result = await useCase.execute('STRIPE', event);

      expect(result).toBe('failed');
      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(payment.errorCode).toBe('insufficient_funds');
      expect(mockPaymentRepo.save).toHaveBeenCalledWith(payment);
      expect(mockWebhookEventRepo.markProcessed).toHaveBeenCalledWith(
        'STRIPE',
        'evt-fail-1',
      );
    });

    it('should return already_failed if payment is already in terminal failure state', async () => {
      const payment = Payment.create({
        id: 'pay-fail-term',
        merchantId: 'merchant-1',
        userId: 'user-1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });
      payment.start();
      payment.fail('insufficient_funds', FailureReason.PROVIDER_ERROR);

      mockPaymentRepo.findById.mockResolvedValue(payment);

      const event: ProviderWebhookEvent = {
        kind: 'payment.failed',
        eventId: 'evt-fail-already',
        paymentId: 'pay-fail-term',
        providerPaymentId: 'pi_fail',
        errorCode: 'insufficient_funds',
      };

      const result = await useCase.execute('STRIPE', event);

      expect(result).toBe('already_failed');
      expect(mockPaymentRepo.save).not.toHaveBeenCalled();
      expect(mockWebhookEventRepo.markProcessed).toHaveBeenCalledWith(
        'STRIPE',
        'evt-fail-already',
      );
    });
  });

  describe('payment.canceled', () => {
    it('should cancel payment and mark event processed', async () => {
      const payment = Payment.create({
        id: 'pay-cancel',
        merchantId: 'merchant-1',
        userId: 'user-1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });
      payment.start();

      mockPaymentRepo.findById.mockResolvedValue(payment);

      const event: ProviderWebhookEvent = {
        kind: 'payment.canceled',
        eventId: 'evt-cancel-1',
        paymentId: 'pay-cancel',
        providerPaymentId: 'pi_cancel',
      };

      const result = await useCase.execute('STRIPE', event);

      expect(result).toBe('canceled');
      expect(payment.status).toBe(PaymentStatus.CANCELLED);
      expect(mockPaymentRepo.save).toHaveBeenCalledWith(payment);
      expect(mockWebhookEventRepo.markProcessed).toHaveBeenCalledWith(
        'STRIPE',
        'evt-cancel-1',
      );
    });

    it('should return already_canceled if already in CANCELLED state', async () => {
      const payment = Payment.create({
        id: 'pay-already-cancel',
        merchantId: 'merchant-1',
        userId: 'user-1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });
      payment.start();
      payment.cancel('user_requested', FailureReason.PROVIDER_ERROR);

      mockPaymentRepo.findById.mockResolvedValue(payment);

      const event: ProviderWebhookEvent = {
        kind: 'payment.canceled',
        eventId: 'evt-cancel-already',
        paymentId: 'pay-already-cancel',
        providerPaymentId: 'pi_cancel',
      };

      const result = await useCase.execute('STRIPE', event);

      expect(result).toBe('already_canceled');
      expect(mockPaymentRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('refund.succeeded', () => {
    it('should confirm existing refund when refundTxId is provided', async () => {
      const payment = Payment.create({
        id: 'pay-ref-1',
        merchantId: 'merchant-1',
        userId: 'user-1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });
      payment.start();
      payment.succeed('pi_ref_1');
      const refundTx = payment.requestRefund(Money.from('40.00', 'USD'));

      mockPaymentRepo.findByProviderPaymentId.mockResolvedValue(payment);

      const event: ProviderWebhookEvent = {
        kind: 'refund.succeeded',
        eventId: 'evt-ref-succ-1',
        providerPaymentId: 'pi_ref_1',
        providerRefundId: 're_123',
        refundTxId: refundTx.id,
        amountMinor: 4000,
      };

      const result = await useCase.execute('STRIPE', event);

      expect(result).toBe('refund_succeeded');
      expect(refundTx.status).toBe('succeeded');
      expect(payment.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
      expect(mockPaymentRepo.save).toHaveBeenCalledWith(payment);
      expect(mockWebhookEventRepo.markProcessed).toHaveBeenCalledWith(
        'STRIPE',
        'evt-ref-succ-1',
      );
    });

    it('should record external refund when refundTxId is not present (dashboard refund)', async () => {
      const payment = Payment.create({
        id: 'pay-ext-ref',
        merchantId: 'merchant-1',
        userId: 'user-1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });
      payment.start();
      payment.succeed('pi_ext_ref');

      mockPaymentRepo.findByProviderPaymentId.mockResolvedValue(payment);

      const event: ProviderWebhookEvent = {
        kind: 'refund.succeeded',
        eventId: 'evt-ext-ref',
        providerPaymentId: 'pi_ext_ref',
        providerRefundId: 're_ext_999',
        amountMinor: 5000,
      };

      const result = await useCase.execute('STRIPE', event);

      expect(result).toBe('refund_succeeded');
      expect(payment.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
      expect(payment.totalRefunded.equals(Money.from('50.00', 'USD'))).toBe(true);
      expect(mockPaymentRepo.save).toHaveBeenCalledWith(payment);
      expect(mockWebhookEventRepo.markProcessed).toHaveBeenCalledWith(
        'STRIPE',
        'evt-ext-ref',
      );
    });
  });

  describe('refund.failed', () => {
    it('should fail refund transaction when refundTxId is provided', async () => {
      const payment = Payment.create({
        id: 'pay-fail-ref',
        merchantId: 'merchant-1',
        userId: 'user-1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });
      payment.start();
      payment.succeed('pi_fail_ref');
      const refundTx = payment.requestRefund(Money.from('30.00', 'USD'));

      mockPaymentRepo.findByProviderPaymentId.mockResolvedValue(payment);

      const event: ProviderWebhookEvent = {
        kind: 'refund.failed',
        eventId: 'evt-fail-ref',
        providerPaymentId: 'pi_fail_ref',
        providerRefundId: 're_failed',
        refundTxId: refundTx.id,
      };

      const result = await useCase.execute('STRIPE', event);

      expect(result).toBe('refund_failed');
      expect(refundTx.status).toBe('failed');
      expect(mockPaymentRepo.save).toHaveBeenCalledWith(payment);
      expect(mockWebhookEventRepo.markProcessed).toHaveBeenCalledWith(
        'STRIPE',
        'evt-fail-ref',
      );
    });
  });

  describe('dispute.created', () => {
    it('should mark requires_review and log alert on dispute', async () => {
      const event: ProviderWebhookEvent = {
        kind: 'dispute.created',
        eventId: 'evt-dispute-1',
        providerPaymentId: 'pi_disputed',
        amountMinor: 10000,
        reason: 'fraudulent',
      };

      const result = await useCase.execute('STRIPE', event);

      expect(result).toBe('requires_review');
      expect(mockWebhookEventRepo.markRequiresReview).toHaveBeenCalledWith(
        'STRIPE',
        'evt-dispute-1',
        'dispute_created',
      );
    });
  });

  describe('ignored', () => {
    it('should mark processed and return ignored for unhandled event types', async () => {
      const event: ProviderWebhookEvent = {
        kind: 'ignored',
        eventId: 'evt-ignore-1',
        type: 'customer.created',
      };

      const result = await useCase.execute('STRIPE', event);

      expect(result).toBe('ignored');
      expect(mockWebhookEventRepo.markProcessed).toHaveBeenCalledWith(
        'STRIPE',
        'evt-ignore-1',
      );
    });
  });
});
