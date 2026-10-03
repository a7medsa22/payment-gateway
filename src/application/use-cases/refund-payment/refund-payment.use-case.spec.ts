import { RefundPaymentUseCase } from './refund-payment.use-case';
import { PaymentRepository } from '@application/ports/payment.repository';
import { PaymentGatewayResolver } from '@application/ports/payment-gateway-resolver.port';
import { PaymentGateway } from '@application/ports/payment-gateway.port';
import { Payment } from '@domain/aggregates/payment.aggregate';
import { Money } from '@domain/value-objects/money.vo';
import { PaymentProvider, PaymentStatus } from '@domain/enums';
import {
  DomainException,
  PaymentException,
  PaymentNotFoundException,
} from '@domain/exceptions/domain.exception';
import { ForbiddenAccessException } from '@domain/exceptions/forbidden-access.exception';

describe('RefundPaymentUseCase', () => {
  let useCase: RefundPaymentUseCase;
  let paymentRepository: jest.Mocked<PaymentRepository>;
  let mockGateway: jest.Mocked<PaymentGateway>;
  let mockGatewayResolver: jest.Mocked<PaymentGatewayResolver>;

  beforeEach(() => {
    paymentRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findByProviderPaymentId: jest.fn().mockResolvedValue(null),
    };
    mockGateway = {
      createPayment: jest.fn(),
      refundPayment: jest.fn().mockResolvedValue({
        providerRefundId: 're_mock_123',
        status: 'succeeded',
      }),
    };
    mockGatewayResolver = {
      resolve: jest.fn().mockReturnValue(mockGateway),
    };
    useCase = new RefundPaymentUseCase(paymentRepository, mockGatewayResolver);
  });

  function createSucceededPayment(): Payment {
    const payment = Payment.create({
      id: 'pay-test-1',
      merchantId: 'merchant-1',
      userId: 'user-1',
      amount: Money.from('100.00', 'USD'),
      provider: PaymentProvider.STRIPE,
    });
    payment.start();
    payment.succeed('ch_123');
    return payment;
  }

  it('should successfully execute a full refund when amount is omitted and call gateway', async () => {
    const payment = createSucceededPayment();
    paymentRepository.findById.mockResolvedValue(payment);

    const result = await useCase.execute({
      paymentId: 'pay-test-1',
      merchantId: 'merchant-1',
      userId: 'user-1',
    });

    expect(mockGatewayResolver.resolve).toHaveBeenCalledWith(PaymentProvider.STRIPE);
    expect(mockGateway.refundPayment).toHaveBeenCalledWith({
      paymentId: 'pay-test-1',
      providerPaymentId: 'ch_123',
      amount: 10000,
      reason: undefined,
    });
    expect(result.status).toBe(PaymentStatus.REFUNDED);
    expect(result.totalRefunded).toBe('100.0000');
    expect(result.refundableAmount).toBe('0.0000');
    expect(result.refundTransactionId).toBeDefined();
    expect(paymentRepository.save).toHaveBeenCalledWith(payment);
  });

  it('should throw PaymentException and not save when payment has no providerPaymentId', async () => {
    const payment = Payment.create({
      id: 'pay-no-provider',
      merchantId: 'merchant-1',
      userId: 'user-1',
      amount: Money.from('100.00', 'USD'),
      provider: PaymentProvider.STRIPE,
    });
    payment.start();
    payment.succeed(); // No provider payment id passed
    paymentRepository.findById.mockResolvedValue(payment);

    await expect(
      useCase.execute({
        paymentId: 'pay-no-provider',
        merchantId: 'merchant-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(PaymentException);

    expect(mockGateway.refundPayment).not.toHaveBeenCalled();
    expect(paymentRepository.save).not.toHaveBeenCalled();
  });

  it('should throw and not save if gateway refund fails', async () => {
    const payment = createSucceededPayment();
    paymentRepository.findById.mockResolvedValue(payment);
    mockGateway.refundPayment.mockResolvedValue({
      providerRefundId: 're_failed',
      status: 'failed',
    });

    await expect(
      useCase.execute({
        paymentId: 'pay-test-1',
        merchantId: 'merchant-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(PaymentException);

    expect(paymentRepository.save).not.toHaveBeenCalled();
  });

  it('should successfully execute a partial refund with specified amount', async () => {
    const payment = createSucceededPayment();
    paymentRepository.findById.mockResolvedValue(payment);

    const result = await useCase.execute({
      paymentId: 'pay-test-1',
      merchantId: 'merchant-1',
      userId: 'user-1',
      amount: '40.00',
      reason: 'Customer return',
    });

    expect(result.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    expect(result.totalRefunded).toBe('40.0000');
    expect(result.refundableAmount).toBe('60.0000');
    expect(result.reason).toBe('Customer return');
    expect(paymentRepository.save).toHaveBeenCalledWith(payment);
  });

  it('should throw PaymentNotFoundException if payment is not found', async () => {
    paymentRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        paymentId: 'non-existent',
        merchantId: 'merchant-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(PaymentNotFoundException);

    expect(paymentRepository.save).not.toHaveBeenCalled();
  });

  it('should throw ForbiddenAccessException when merchantId does not own the payment', async () => {
    const payment = createSucceededPayment(); // merchantId = 'merchant-1'
    paymentRepository.findById.mockResolvedValue(payment);

    await expect(
      useCase.execute({
        paymentId: 'pay-test-1',
        merchantId: 'attacker-merchant',
        userId: 'user-1',
      }),
    ).rejects.toThrow(ForbiddenAccessException);

    expect(paymentRepository.save).not.toHaveBeenCalled();
  });

  it('should propagate DomainException when domain invariants are violated', async () => {
    const payment = Payment.create({
      id: 'pay-created',
      merchantId: 'merchant-1',
      userId: 'user-1',
      amount: Money.from('100.00', 'USD'),
      provider: PaymentProvider.STRIPE,
    });
    paymentRepository.findById.mockResolvedValue(payment);

    await expect(
      useCase.execute({
        paymentId: 'pay-created',
        merchantId: 'merchant-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(DomainException);

    expect(paymentRepository.save).not.toHaveBeenCalled();
  });
});
