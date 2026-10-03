import { CreatePaymentUseCase } from './create-payment.use-case';
import { PaymentRepository } from '@application/ports/payment.repository';
import { PaymentGatewayResolver } from '@application/ports/payment-gateway-resolver.port';
import {
  PaymentGateway,
  CreatePaymentGatewayResult,
} from '@application/ports/payment-gateway.port';
import { PaymentProvider, PaymentStatus } from '@domain/enums';
import { DomainException } from '@domain/exceptions/domain.exception';
import { Payment } from '@domain/aggregates/payment.aggregate';

describe('CreatePaymentUseCase', () => {
  let useCase: CreatePaymentUseCase;
  let mockPaymentRepository: jest.Mocked<PaymentRepository>;
  let mockGatewayResolver: jest.Mocked<PaymentGatewayResolver>;
  let mockPaymentGateway: jest.Mocked<PaymentGateway>;

  beforeEach(() => {
    mockPaymentRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(null),
      findByProviderPaymentId: jest.fn().mockResolvedValue(null),
    };

    mockPaymentGateway = {
      createPayment: jest.fn(),
      refundPayment: jest.fn(),
    };

    mockGatewayResolver = {
      resolve: jest.fn().mockReturnValue(mockPaymentGateway),
    };

    useCase = new CreatePaymentUseCase(
      mockPaymentRepository,
      mockGatewayResolver,
    );
  });

  it('should successfully create and process a payment when gateway returns succeeded', async () => {
    const gatewayResult: CreatePaymentGatewayResult = {
      providerPaymentId: 'pi_stripe_123',
      status: 'succeeded',
      clientSecret: 'secret_123',
    };
    mockPaymentGateway.createPayment.mockResolvedValueOnce(gatewayResult);

    const result = await useCase.execute({
      merchantId: 'merchant_123',
      userId: 'user_123',
      amount: '100.00',
      currency: 'USD',
      provider: 'stripe',
      description: 'Test payment',
    });

    expect(mockGatewayResolver.resolve).toHaveBeenCalledWith(
      PaymentProvider.STRIPE,
    );
    expect(mockPaymentGateway.createPayment).toHaveBeenCalledWith({
      paymentId: result.id,
      amount: 10000,
      currency: 'USD',
      description: 'Test payment',
    });

    expect(mockPaymentRepository.save).toHaveBeenCalledTimes(2);
    const finalSavedPayment: Payment = mockPaymentRepository.save.mock.calls[1][0];
    expect(finalSavedPayment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(finalSavedPayment.merchantId).toBe('merchant_123');
    expect(finalSavedPayment.transactions).toHaveLength(1);

    expect(result).toEqual({
      id: finalSavedPayment.id,
      merchantId: 'merchant_123',
      userId: 'user_123',
      amount: '100.0000',
      currency: 'USD',
      status: PaymentStatus.SUCCEEDED,
      provider: PaymentProvider.STRIPE,
      providerPaymentId: 'pi_stripe_123',
      clientSecret: 'secret_123',
      createdAt: finalSavedPayment.createdAt,
    });
  });

  it('should persist payment in PENDING state before calling gateway', async () => {
    const callOrder: string[] = [];
    mockPaymentRepository.save.mockImplementation(async (payment) => {
      callOrder.push(`save_${payment.status}`);
    });
    mockPaymentGateway.createPayment.mockImplementation(async () => {
      callOrder.push('gateway_create');
      return {
        providerPaymentId: 'pi_123',
        status: 'succeeded',
      };
    });

    await useCase.execute({
      merchantId: 'merchant_123',
      userId: 'user_123',
      amount: '50.00',
      currency: 'USD',
      provider: 'stripe',
    });

    expect(callOrder).toEqual([
      'save_pending',
      'gateway_create',
      'save_succeeded',
    ]);
  });

  it('should mark payment as FAILED and save when gateway throws an error', async () => {
    const savedStatuses: PaymentStatus[] = [];
    mockPaymentRepository.save.mockImplementation(async (payment) => {
      savedStatuses.push(payment.status);
    });

    mockPaymentGateway.createPayment.mockRejectedValueOnce(
      new Error('Stripe network timeout'),
    );

    await expect(
      useCase.execute({
        merchantId: 'merchant_123',
        userId: 'user_123',
        amount: '50.00',
        currency: 'USD',
        provider: 'stripe',
      }),
    ).rejects.toThrow('Stripe network timeout');

    expect(mockPaymentRepository.save).toHaveBeenCalledTimes(2);
    expect(savedStatuses).toEqual([PaymentStatus.PENDING, PaymentStatus.FAILED]);
    const failedPayment: Payment = mockPaymentRepository.save.mock.calls[1][0];
    expect(failedPayment.errorCode).toBe('provider_error');
  });

  it('should keep payment in PENDING status when gateway returns pending and store providerPaymentId', async () => {
    const gatewayResult: CreatePaymentGatewayResult = {
      providerPaymentId: 'pi_stripe_pending_123',
      status: 'pending',
      clientSecret: 'secret_pending',
    };
    mockPaymentGateway.createPayment.mockResolvedValueOnce(gatewayResult);

    const result = await useCase.execute({
      merchantId: 'merchant_123',
      userId: 'user_456',
      amount: '50.00',
      currency: 'EUR',
      provider: 'paymob',
    });

    expect(mockGatewayResolver.resolve).toHaveBeenCalledWith(
      PaymentProvider.PAYMOB,
    );
    expect(result.status).toBe(PaymentStatus.PENDING);
    expect(result.providerPaymentId).toBe('pi_stripe_pending_123');

    expect(mockPaymentRepository.save).toHaveBeenCalledTimes(2);
    const savedPayment: Payment = mockPaymentRepository.save.mock.calls[1][0];
    expect(savedPayment.status).toBe(PaymentStatus.PENDING);
    expect(savedPayment.merchantId).toBe('merchant_123');
    expect(savedPayment.providerPaymentId).toBe('pi_stripe_pending_123');
    expect(savedPayment.transactions).toHaveLength(0);
  });

  it('should mark payment as FAILED when gateway returns failed', async () => {
    const gatewayResult: CreatePaymentGatewayResult = {
      providerPaymentId: 'pi_stripe_failed_123',
      status: 'failed',
    };
    mockPaymentGateway.createPayment.mockResolvedValueOnce(gatewayResult);

    const result = await useCase.execute({
      merchantId: 'merchant_123',
      userId: 'user_789',
      amount: '20.00',
      currency: 'USD',
      provider: 'stripe',
    });

    expect(result.status).toBe(PaymentStatus.FAILED);

    expect(mockPaymentRepository.save).toHaveBeenCalledTimes(2);
    const savedPayment: Payment = mockPaymentRepository.save.mock.calls[1][0];
    expect(savedPayment.status).toBe(PaymentStatus.FAILED);
    expect(savedPayment.merchantId).toBe('merchant_123');
    expect(savedPayment.errorCode).toBe('provider_rejected');
  });

  it('should throw DomainException for unsupported currency', async () => {
    await expect(
      useCase.execute({
        merchantId: 'merchant_123',
        userId: 'user_123',
        amount: '100.00',
        currency: 'INVALID_CURRENCY',
        provider: 'stripe',
      }),
    ).rejects.toThrow('Unsupported currency: INVALID_CURRENCY');

    expect(mockPaymentGateway.createPayment).not.toHaveBeenCalled();
    expect(mockPaymentRepository.save).not.toHaveBeenCalled();
  });

  it('should throw DomainException for unsupported provider', async () => {
    await expect(
      useCase.execute({
        merchantId: 'merchant_123',
        userId: 'user_123',
        amount: '100.00',
        currency: 'USD',
        provider: 'unsupported_provider',
      }),
    ).rejects.toThrow('Unsupported payment provider: unsupported_provider');

    expect(mockPaymentGateway.createPayment).not.toHaveBeenCalled();
    expect(mockPaymentRepository.save).not.toHaveBeenCalled();
  });

  it('should propagate repository errors', async () => {
    mockPaymentGateway.createPayment.mockResolvedValueOnce({
      providerPaymentId: 'pi_123',
      status: 'succeeded',
    });
    mockPaymentRepository.save.mockRejectedValueOnce(
      new Error('Database error'),
    );

    await expect(
      useCase.execute({
        merchantId: 'merchant_123',
        userId: 'user_123',
        amount: '10.00',
        currency: 'USD',
        provider: 'stripe',
      }),
    ).rejects.toThrow('Database error');

    expect(mockPaymentGateway.createPayment).not.toHaveBeenCalled();
  });
});
