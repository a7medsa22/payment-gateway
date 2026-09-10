import Stripe from 'stripe';
import { StripePaymentGateway } from './stripe-payment-gateway';
import { PaymentGatewayException } from './payment-gateway.exception';
import { CreatePaymentGatewayRequest } from '@application/ports/payment-gateway.port';

const actualStripe = jest.requireActual<typeof import('stripe')>('stripe');

const mockCreate = jest.fn();

jest.mock('stripe', () => {
  const actual = jest.requireActual<typeof import('stripe')>('stripe');
  const MockStripe = jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: mockCreate,
    },
  }));
  Object.assign(MockStripe, { errors: actual.default.errors });
  return {
    __esModule: true,
    default: MockStripe,
    errors: actual.default.errors,
  };
});

describe('StripePaymentGateway', () => {
  let gateway: StripePaymentGateway;

  const sampleRequest: CreatePaymentGatewayRequest = {
    paymentId: 'pay_test_123',
    amount: 5000,
    currency: 'USD',
    description: 'Test Order #123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockReset();
    gateway = new StripePaymentGateway('sk_test_mock_key');
  });

  describe('constructor', () => {
    it('should initialize Stripe with default apiVersion when not provided', () => {
      new StripePaymentGateway('sk_test_123');
      expect(Stripe).toHaveBeenCalledWith('sk_test_123', {
        apiVersion: '2023-10-16',
      });
    });

    it('should initialize Stripe with custom apiVersion when provided', () => {
      new StripePaymentGateway('sk_test_123', '2022-11-15');
      expect(Stripe).toHaveBeenCalledWith('sk_test_123', {
        apiVersion: '2022-11-15',
      });
    });
  });

  describe('createPayment', () => {
    it('should create payment intent with correct parameters', async () => {
      mockCreate.mockResolvedValue({
        id: 'pi_test_abc',
        status: 'succeeded',
        client_secret: 'pi_test_abc_secret_xyz',
      });

      const result = await gateway.createPayment(sampleRequest);

      expect(mockCreate).toHaveBeenCalledWith({
        amount: 5000,
        currency: 'usd',
        description: 'Test Order #123',
        metadata: {
          paymentId: 'pay_test_123',
        },
      });

      expect(result).toEqual({
        providerPaymentId: 'pi_test_abc',
        status: 'succeeded',
        clientSecret: 'pi_test_abc_secret_xyz',
      });
    });

    it('should map succeeded status correctly', async () => {
      mockCreate.mockResolvedValue({
        id: 'pi_1',
        status: 'succeeded',
        client_secret: 'sec_1',
      });

      const result = await gateway.createPayment(sampleRequest);
      expect(result.status).toBe('succeeded');
    });

    it('should map canceled status to failed', async () => {
      mockCreate.mockResolvedValue({
        id: 'pi_2',
        status: 'canceled',
        client_secret: null,
      });

      const result = await gateway.createPayment(sampleRequest);
      expect(result.status).toBe('failed');
      expect(result.clientSecret).toBeUndefined();
    });

    it('should map requires_payment_method status to pending', async () => {
      mockCreate.mockResolvedValue({
        id: 'pi_3',
        status: 'requires_payment_method',
        client_secret: 'sec_3',
      });

      const result = await gateway.createPayment(sampleRequest);
      expect(result.status).toBe('pending');
    });

    it('should map requires_action status to pending', async () => {
      mockCreate.mockResolvedValue({
        id: 'pi_4',
        status: 'requires_action',
        client_secret: 'sec_4',
      });

      const result = await gateway.createPayment(sampleRequest);
      expect(result.status).toBe('pending');
    });

    it('should map processing status to pending', async () => {
      mockCreate.mockResolvedValue({
        id: 'pi_5',
        status: 'processing',
        client_secret: 'sec_5',
      });

      const result = await gateway.createPayment(sampleRequest);
      expect(result.status).toBe('pending');
    });
  });

  describe('error handling', () => {
    it('should translate StripeCardError to PaymentGatewayException', async () => {
      const cardError = new actualStripe.default.errors.StripeCardError({
        message: 'Your card was declined',
        type: 'card_error',
      });
      mockCreate.mockRejectedValue(cardError);

      await expect(gateway.createPayment(sampleRequest)).rejects.toThrow(
        PaymentGatewayException,
      );
      await expect(gateway.createPayment(sampleRequest)).rejects.toThrow(
        'Payment declined: Your card was declined',
      );
    });

    it('should translate StripeInvalidRequestError to PaymentGatewayException', async () => {
      const invalidReqError =
        new actualStripe.default.errors.StripeInvalidRequestError({
          message: 'Invalid amount',
          type: 'invalid_request_error',
        });
      mockCreate.mockRejectedValue(invalidReqError);

      await expect(gateway.createPayment(sampleRequest)).rejects.toThrow(
        PaymentGatewayException,
      );
      await expect(gateway.createPayment(sampleRequest)).rejects.toThrow(
        'Invalid payment request: Invalid amount',
      );
    });

    it('should translate StripeAuthenticationError to PaymentGatewayException', async () => {
      const authError =
        new actualStripe.default.errors.StripeAuthenticationError({
          message: 'Invalid API Key',
          type: 'authentication_error',
        });
      mockCreate.mockRejectedValue(authError);

      await expect(gateway.createPayment(sampleRequest)).rejects.toThrow(
        PaymentGatewayException,
      );
      await expect(gateway.createPayment(sampleRequest)).rejects.toThrow(
        'Payment provider authentication failed',
      );
    });

    it('should translate StripeRateLimitError to PaymentGatewayException', async () => {
      const rateLimitError =
        new actualStripe.default.errors.StripeRateLimitError({
          message: 'Too many requests',
          type: 'rate_limit_error',
        });
      mockCreate.mockRejectedValue(rateLimitError);

      await expect(gateway.createPayment(sampleRequest)).rejects.toThrow(
        PaymentGatewayException,
      );
      await expect(gateway.createPayment(sampleRequest)).rejects.toThrow(
        'Payment provider rate limit exceeded',
      );
    });

    it('should translate StripeConnectionError to PaymentGatewayException', async () => {
      const connError =
        new actualStripe.default.errors.StripeConnectionError({
          message: 'Network timeout',
          type: 'api_error',
        });
      mockCreate.mockRejectedValue(connError);

      await expect(gateway.createPayment(sampleRequest)).rejects.toThrow(
        PaymentGatewayException,
      );
      await expect(gateway.createPayment(sampleRequest)).rejects.toThrow(
        'Payment provider unavailable',
      );
    });

    it('should translate StripeAPIError to PaymentGatewayException', async () => {
      const apiError = new actualStripe.default.errors.StripeAPIError({
        message: 'Internal server error on Stripe',
        type: 'api_error',
      });
      mockCreate.mockRejectedValue(apiError);

      await expect(gateway.createPayment(sampleRequest)).rejects.toThrow(
        PaymentGatewayException,
      );
      await expect(gateway.createPayment(sampleRequest)).rejects.toThrow(
        'Payment provider error: Internal server error on Stripe',
      );
    });

    it('should translate unexpected error to PaymentGatewayException', async () => {
      const unknownError = new Error('Something broke');
      mockCreate.mockRejectedValue(unknownError);

      await expect(gateway.createPayment(sampleRequest)).rejects.toThrow(
        PaymentGatewayException,
      );
      await expect(gateway.createPayment(sampleRequest)).rejects.toThrow(
        'Unexpected payment provider error',
      );
    });

    it('should preserve original error as cause in PaymentGatewayException', async () => {
      const rawError = new Error('Network crash');
      mockCreate.mockRejectedValue(rawError);

      try {
        await gateway.createPayment(sampleRequest);
        fail('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(PaymentGatewayException);
        if (err instanceof PaymentGatewayException) {
          expect(err.cause).toBe(rawError);
        }
      }
    });
  });
});
