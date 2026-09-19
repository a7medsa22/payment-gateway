import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StripeWebhookController } from './stripe-webhook.controller';
import { PaymentRepository } from '@application/ports/payment.repository';
import { WebhookEventRepository } from '@application/ports/webhook-event.repository';
import { Payment } from '@domain/aggregates/payment.aggregate';
import { Money } from '@domain/value-objects/money.vo';
import { PaymentProvider, PaymentStatus } from '@domain/enums';

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockPaymentRepo: jest.Mocked<Required<PaymentRepository>>;
  let mockWebhookEventRepo: jest.Mocked<WebhookEventRepository>;
  let mockStripe: jest.Mocked<Stripe>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'providers.stripe.secretKey') return 'sk_test_123';
        if (key === 'providers.stripe.webhookSecret') return 'whsec_test_secret';
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    mockPaymentRepo = {
      findById: jest.fn(),
      findByProviderPaymentId: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Required<PaymentRepository>>;

    mockWebhookEventRepo = {
      exists: jest.fn().mockResolvedValue(false),
      record: jest.fn().mockResolvedValue(undefined),
      markProcessed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WebhookEventRepository>;

    mockStripe = {
      webhooks: {
        constructEvent: jest.fn(),
      },
    } as unknown as jest.Mocked<Stripe>;

    controller = new StripeWebhookController(
      mockConfigService,
      mockPaymentRepo,
      mockWebhookEventRepo,
      mockStripe,
    );
  });

  describe('handleStripeWebhook()', () => {
    it('should throw BadRequestException if stripe-signature header is missing', async () => {
      await expect(
        controller.handleStripeWebhook('', Buffer.from('payload')),
      ).rejects.toThrow(new BadRequestException('Missing stripe-signature header'));
    });

    it('should throw BadRequestException if signature verification fails', async () => {
      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(
        controller.handleStripeWebhook('sig_invalid', Buffer.from('payload')),
      ).rejects.toThrow(
        new BadRequestException('Webhook signature verification failed: Invalid signature'),
      );
    });

    it('should return already_processed if event was previously handled (deduplication)', async () => {
      const mockEvent: Stripe.Event = {
        id: 'evt_duplicate_1',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123' } },
      } as any;

      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);
      mockWebhookEventRepo.exists.mockResolvedValue(true);

      const result = await controller.handleStripeWebhook(
        'sig_valid',
        Buffer.from('payload'),
      );

      expect(result).toEqual({ received: true, status: 'already_processed' });
      expect(mockWebhookEventRepo.exists).toHaveBeenCalledWith('STRIPE', 'evt_duplicate_1');
      expect(mockPaymentRepo.save).not.toHaveBeenCalled();
    });

    it('should handle payment_intent.succeeded and transition payment to SUCCEEDED', async () => {
      const payment = Payment.create({
        id: 'pay-uuid-1',
        userId: 'usr_1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });
      payment.start();

      const mockEvent: Stripe.Event = {
        id: 'evt_success_1',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_stripe_100',
            metadata: { paymentId: 'pay-uuid-1' },
          },
        },
      } as any;

      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);
      mockPaymentRepo.findById.mockResolvedValue(payment);

      const result = await controller.handleStripeWebhook(
        'sig_valid',
        Buffer.from('payload'),
      );

      expect(result).toEqual({ received: true, status: 'succeeded' });
      expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
      expect(mockPaymentRepo.save).toHaveBeenCalledWith(payment);
      expect(mockWebhookEventRepo.markProcessed).toHaveBeenCalledWith('STRIPE', 'evt_success_1');
    });

    it('should be idempotent if payment is already in SUCCEEDED state', async () => {
      const payment = Payment.create({
        id: 'pay-uuid-2',
        userId: 'usr_1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });
      payment.start();
      payment.succeed('pi_stripe_100');

      const mockEvent: Stripe.Event = {
        id: 'evt_success_2',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_stripe_100',
            metadata: { paymentId: 'pay-uuid-2' },
          },
        },
      } as any;

      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);
      mockPaymentRepo.findById.mockResolvedValue(payment);

      const result = await controller.handleStripeWebhook(
        'sig_valid',
        Buffer.from('payload'),
      );

      expect(result).toEqual({ received: true, status: 'already_succeeded' });
      expect(mockPaymentRepo.save).not.toHaveBeenCalled();
      expect(mockWebhookEventRepo.markProcessed).toHaveBeenCalledWith('STRIPE', 'evt_success_2');
    });

    it('should handle payment_intent.payment_failed and transition payment to FAILED', async () => {
      const payment = Payment.create({
        id: 'pay-uuid-3',
        userId: 'usr_1',
        amount: Money.from('100.00', 'USD'),
        provider: PaymentProvider.STRIPE,
      });
      payment.start();

      const mockEvent: Stripe.Event = {
        id: 'evt_fail_1',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_stripe_300',
            metadata: { paymentId: 'pay-uuid-3' },
            last_payment_error: { code: 'card_declined' },
          },
        },
      } as any;

      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);
      mockPaymentRepo.findById.mockResolvedValue(payment);

      const result = await controller.handleStripeWebhook(
        'sig_valid',
        Buffer.from('payload'),
      );

      expect(result).toEqual({ received: true, status: 'failed' });
      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(mockPaymentRepo.save).toHaveBeenCalledWith(payment);
      expect(mockWebhookEventRepo.markProcessed).toHaveBeenCalledWith('STRIPE', 'evt_fail_1');
    });

    it('should return payment_not_found if no payment matches intent or metadata', async () => {
      const mockEvent: Stripe.Event = {
        id: 'evt_unknown_1',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_unknown',
            metadata: {},
          },
        },
      } as any;

      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);
      mockPaymentRepo.findByProviderPaymentId.mockResolvedValue(null);

      const result = await controller.handleStripeWebhook(
        'sig_valid',
        Buffer.from('payload'),
      );

      expect(result).toEqual({ received: true, status: 'payment_not_found' });
      expect(mockPaymentRepo.save).not.toHaveBeenCalled();
    });

    it('should return ignored for unhandled Stripe events', async () => {
      const mockEvent: Stripe.Event = {
        id: 'evt_other_1',
        type: 'customer.created',
        data: { object: { id: 'cus_123' } },
      } as any;

      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);

      const result = await controller.handleStripeWebhook(
        'sig_valid',
        Buffer.from('payload'),
      );

      expect(result).toEqual({ received: true, status: 'ignored' });
      expect(mockWebhookEventRepo.markProcessed).toHaveBeenCalledWith('STRIPE', 'evt_other_1');
    });
  });
});
