import { RefundPaymentUseCase } from './refund-payment.use-case';
import { PaymentRepository } from '@application/ports/payment.repository';
import { PaymentGatewayResolver } from '@application/ports/payment-gateway-resolver.port';
import { PaymentGateway } from '@application/ports/payment-gateway.port';
import { Payment } from '@domain/aggregates/payment.aggregate';
import { Money } from '@domain/value-objects/money.vo';
import { PaymentProvider, PaymentStatus, TransactionStatus } from '@domain/enums';
import {
  DomainException,
  PaymentException,
  PaymentNotFoundException,
} from '@domain/exceptions/domain.exception';
import { PaymentGatewayException } from '@application/exceptions/payment-gateway.exception';

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
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
    };
    mockGateway = {
      createPayment: jest.fn(),
      refundPayment: jest.fn().mockResolvedValue({
        providerRefundId: 're_mock_123',
        status: 'succeeded',
      }),
      retrievePayment: jest.fn(),
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

  it('should reserve before calling gateway, pass refundTxId, and confirm on success', async () => {
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
      refundTxId: expect.any(String),
      providerPaymentId: 'ch_123',
      amount: 10000,
      currency: 'USD',
      reason: undefined,
    });
    expect(result.status).toBe(PaymentStatus.REFUNDED);
    expect(result.refundStatus).toBe('succeeded');
    expect(result.totalRefunded).toBe('100.0000');
    expect(result.refundableAmount).toBe('0.0000');
    expect(result.refundTransactionId).toBeDefined();
    // Persisted once for reserve, once for confirm
    expect(paymentRepository.save).toHaveBeenCalledTimes(2);
  });

  it('should throw PaymentException and not call gateway when payment has no providerPaymentId', async () => {
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
  });

  it('should fail refund transaction and release reservation on non-ambiguous gateway error', async () => {
    const payment = createSucceededPayment();
    paymentRepository.findById.mockResolvedValue(payment);
    mockGateway.refundPayment.mockRejectedValue(
      new PaymentGatewayException('Card cannot be refunded', false),
    );

    await expect(
      useCase.execute({
        paymentId: 'pay-test-1',
        merchantId: 'merchant-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(PaymentGatewayException);

    // Reserved save + failed release save
    expect(paymentRepository.save).toHaveBeenCalledTimes(2);
    expect(payment.refundableAmount.amount).toBe('100.0000');
    expect(payment.transactions[1].status).toBe(TransactionStatus.FAILED);
  });

  it('should keep refund transaction PENDING on ambiguous gateway error', async () => {
    const payment = createSucceededPayment();
    paymentRepository.findById.mockResolvedValue(payment);
    mockGateway.refundPayment.mockRejectedValue(
      new PaymentGatewayException('Network timeout', true),
    );

    await expect(
      useCase.execute({
        paymentId: 'pay-test-1',
        merchantId: 'merchant-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(PaymentGatewayException);

    // Only reserve save was executed, no fail release
    expect(paymentRepository.save).toHaveBeenCalledTimes(1);
    expect(payment.transactions[1].status).toBe(TransactionStatus.PENDING);
    // Reserved amount reduces refundable amount
    expect(payment.refundableAmount.amount).toBe('0.0000');
  });

  it('should keep transaction PENDING with providerRefundId when Stripe returns pending', async () => {
    const payment = createSucceededPayment();
    paymentRepository.findById.mockResolvedValue(payment);
    mockGateway.refundPayment.mockResolvedValue({
      providerRefundId: 're_pending_123',
      status: 'pending',
    });

    const result = await useCase.execute({
      paymentId: 'pay-test-1',
      merchantId: 'merchant-1',
      userId: 'user-1',
    });

    expect(result.status).toBe(PaymentStatus.SUCCEEDED); // Status not moved to REFUNDED
    expect(result.refundStatus).toBe('pending');
    expect(payment.transactions[1].status).toBe(TransactionStatus.PENDING);
    expect(payment.transactions[1].providerTransactionId).toBe('re_pending_123');
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
    expect(paymentRepository.save).toHaveBeenCalledTimes(2);
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

  it('should throw PaymentNotFoundException when merchantId does not own the payment (single 404 rule)', async () => {
    const payment = createSucceededPayment(); // merchantId = 'merchant-1'
    paymentRepository.findById.mockResolvedValue(payment);

    await expect(
      useCase.execute({
        paymentId: 'pay-test-1',
        merchantId: 'attacker-merchant',
        userId: 'user-1',
      }),
    ).rejects.toThrow(PaymentNotFoundException);

    expect(paymentRepository.save).not.toHaveBeenCalled();
  });

  it('should prevent reserving more than available refundable balance', async () => {
    const payment = createSucceededPayment();
    paymentRepository.findById.mockResolvedValue(payment);

    await expect(
      useCase.execute({
        paymentId: 'pay-test-1',
        merchantId: 'merchant-1',
        userId: 'user-1',
        amount: '150.00',
      }),
    ).rejects.toThrow(DomainException);

    expect(mockGateway.refundPayment).not.toHaveBeenCalled();
  });
});
