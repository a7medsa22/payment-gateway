import Stripe from 'stripe';
import { StripePaymentGateway } from './stripe-payment-gateway';
import { PaymentGatewayException } from '@application/exceptions/payment-gateway.exception';
import { CreatePaymentGatewayRequest } from '@application/ports/payment-gateway.port';

const actualStripe = jest.requireActual<typeof import('stripe')>('stripe');

const mockCreate = jest.fn();
const mockRetrieve = jest.fn();
const mockRefundsCreate = jest.fn();

jest.mock('stripe', () => {
  const actual = jest.requireActual<typeof import('stripe')>('stripe');
  const MockStripe = jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: mockCreate,
      retrieve: mockRetrieve,
    },
    refunds: {
      create: mockRefundsCreate,
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
    idempotencyKey: 'idemp_key_123',
    amount: 5000,
    currency: 'USD',
    description: 'Test Order #123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockReset();
    mockRetrieve.mockReset();
    mockRefundsCreate.mockReset();
    gateway = new StripePaymentGateway('sk_test_mock_key');
  });

  describe('constructor', () => {
    it('should initialize Stripe with default apiVersion when not provided', () => {
      new StripePaymentGateway('sk_test_123');
      expect(Stripe).toHaveBeenCalledWith(
        'sk_test_123',
        expect.objectContaining({
          apiVersion: '2023-10-16',
        }),
      );
    });

    it('should initialize Stripe with custom apiVersion when provided', () => {
      new StripePaymentGateway('sk_test_123', '2022-11-15');
      expect(Stripe).toHaveBeenCalledWith(
        'sk_test_123',
        expect.objectContaining({
          apiVersion: '2022-11-15',
        }),
      );
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

      expect(mockCreate).toHaveBeenCalledWith(
        {
          amount: 5000,
          currency: 'usd',
          description: 'Test Order #123',
          metadata: {
            paymentId: 'pay_test_123',
          },
        },
        { idempotencyKey: 'idemp_key_123' },
      );

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

  describe('error handling and ambiguity classification', () => {
    it('should translate StripeCardError to non-ambiguous PaymentGatewayException', async () => {
      const cardError = new actualStripe.default.errors.StripeCardError({
        message: 'Your card was declined',
        type: 'card_error',
      });
      mockCreate.mockRejectedValue(cardError);

      try {
        await gateway.createPayment(sampleRequest);
        fail('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(PaymentGatewayException);
        const pge = err as PaymentGatewayException;
        expect(pge.message).toBe('Payment declined: Your card was declined');
        expect(pge.ambiguous).toBe(false);
      }
    });

    it('should translate StripeInvalidRequestError to non-ambiguous PaymentGatewayException', async () => {
      const invalidReqError =
        new actualStripe.default.errors.StripeInvalidRequestError({
          message: 'Invalid amount',
          type: 'invalid_request_error',
        });
      mockCreate.mockRejectedValue(invalidReqError);

      try {
        await gateway.createPayment(sampleRequest);
        fail('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(PaymentGatewayException);
        const pge = err as PaymentGatewayException;
        expect(pge.message).toBe('Invalid payment request: Invalid amount');
        expect(pge.ambiguous).toBe(false);
      }
    });

    it('should translate StripeAuthenticationError to non-ambiguous PaymentGatewayException', async () => {
      const authError =
        new actualStripe.default.errors.StripeAuthenticationError({
          message: 'Invalid API Key',
          type: 'authentication_error',
        });
      mockCreate.mockRejectedValue(authError);

      try {
        await gateway.createPayment(sampleRequest);
        fail('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(PaymentGatewayException);
        const pge = err as PaymentGatewayException;
        expect(pge.ambiguous).toBe(false);
      }
    });

    it('should translate StripeRateLimitError to non-ambiguous PaymentGatewayException', async () => {
      const rateLimitError =
        new actualStripe.default.errors.StripeRateLimitError({
          message: 'Too many requests',
          type: 'rate_limit_error',
        });
      mockCreate.mockRejectedValue(rateLimitError);

      try {
        await gateway.createPayment(sampleRequest);
        fail('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(PaymentGatewayException);
        const pge = err as PaymentGatewayException;
        expect(pge.ambiguous).toBe(false);
      }
    });

    it('should translate StripeIdempotencyError to non-ambiguous PaymentGatewayException', async () => {
      const idempotencyError =
        new actualStripe.default.errors.StripeIdempotencyError({
          message: 'Keys differ',
          type: 'idempotency_error',
        });
      mockCreate.mockRejectedValue(idempotencyError);

      try {
        await gateway.createPayment(sampleRequest);
        fail('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(PaymentGatewayException);
        const pge = err as PaymentGatewayException;
        expect(pge.ambiguous).toBe(false);
      }
    });

    it('should translate StripeConnectionError to ambiguous PaymentGatewayException', async () => {
      const connError =
        new actualStripe.default.errors.StripeConnectionError({
          message: 'Network timeout',
          type: 'api_error',
        });
      mockCreate.mockRejectedValue(connError);

      try {
        await gateway.createPayment(sampleRequest);
        fail('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(PaymentGatewayException);
        const pge = err as PaymentGatewayException;
        expect(pge.message).toBe('Payment provider unavailable');
        expect(pge.ambiguous).toBe(true);
      }
    });

    it('should translate StripeAPIError to ambiguous PaymentGatewayException', async () => {
      const apiError = new actualStripe.default.errors.StripeAPIError({
        message: 'Internal server error on Stripe',
        type: 'api_error',
      });
      mockCreate.mockRejectedValue(apiError);

      try {
        await gateway.createPayment(sampleRequest);
        fail('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(PaymentGatewayException);
        const pge = err as PaymentGatewayException;
        expect(pge.ambiguous).toBe(true);
      }
    });

    it('should translate unexpected error to ambiguous PaymentGatewayException', async () => {
      const unknownError = new Error('Something broke');
      mockCreate.mockRejectedValue(unknownError);

      try {
        await gateway.createPayment(sampleRequest);
        fail('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(PaymentGatewayException);
        const pge = err as PaymentGatewayException;
        expect(pge.ambiguous).toBe(true);
      }
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

  describe('refundPayment', () => {
    it('should call stripe.refunds.create with idempotency key and return mapped result', async () => {
      mockRefundsCreate.mockResolvedValue({
        id: 're_123',
        status: 'succeeded',
      });

      const result = await gateway.refundPayment({
        paymentId: 'pay_test_123',
        refundTxId: 'ref_tx_999',
        providerPaymentId: 'pi_test_123',
        amount: 3000,
        currency: 'USD',
        reason: 'Customer return',
      });

      expect(mockRefundsCreate).toHaveBeenCalledWith(
        {
          payment_intent: 'pi_test_123',
          amount: 3000,
          metadata: {
            paymentId: 'pay_test_123',
            refundTxId: 'ref_tx_999',
            reason: 'Customer return',
          },
        },
        { idempotencyKey: 'refund:ref_tx_999' },
      );

      expect(result).toEqual({
        providerRefundId: 're_123',
        status: 'succeeded',
      });
    });

    it('should translate stripe errors to PaymentGatewayException on refund', async () => {
      mockRefundsCreate.mockRejectedValue(new Error('Stripe refund failed'));

      await expect(
        gateway.refundPayment({
          paymentId: 'pay_test_123',
          refundTxId: 'ref_tx_999',
          providerPaymentId: 'pi_test_123',
          amount: 3000,
          currency: 'USD',
        }),
      ).rejects.toThrow(PaymentGatewayException);
    });
  });

  describe('retrievePayment', () => {
    it('should retrieve payment intent and map succeeded status and clientSecret', async () => {
      mockRetrieve.mockResolvedValue({
        id: 'pi_123',
        status: 'succeeded',
        amount: 5000,
        currency: 'usd',
        client_secret: 'pi_123_secret',
      });

      const result = await gateway.retrievePayment('pi_123');

      expect(mockRetrieve).toHaveBeenCalledWith('pi_123');
      expect(result).toEqual({
        status: 'succeeded',
        amount: 5000,
        currency: 'USD',
        clientSecret: 'pi_123_secret',
      });
    });

    it('should map canceled status', async () => {
      mockRetrieve.mockResolvedValue({
        id: 'pi_123',
        status: 'canceled',
        amount: 5000,
        currency: 'usd',
      });

      const result = await gateway.retrievePayment('pi_123');
      expect(result.status).toBe('canceled');
    });

    it('should map failed when requires_payment_method with last_payment_error', async () => {
      mockRetrieve.mockResolvedValue({
        id: 'pi_123',
        status: 'requires_payment_method',
        last_payment_error: { code: 'card_declined' },
        amount: 5000,
        currency: 'usd',
      });

      const result = await gateway.retrievePayment('pi_123');
      expect(result.status).toBe('failed');
    });

    it('should translate stripe errors to PaymentGatewayException', async () => {
      mockRetrieve.mockRejectedValue(new Error('Stripe retrieve failed'));

      await expect(gateway.retrievePayment('pi_123')).rejects.toThrow(
        PaymentGatewayException,
      );
    });
  });
});
