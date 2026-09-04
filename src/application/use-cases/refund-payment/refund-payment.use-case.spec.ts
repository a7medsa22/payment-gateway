import { RefundPaymentUseCase } from './refund-payment.use-case';
import { PaymentRepository } from '@application/ports/payment.repository';
import { Payment } from '@domain/aggregates/payment.aggregate';
import { Money } from '@domain/value-objects/money.vo';
import { PaymentProvider, PaymentStatus } from '@domain/enums';
import {
  DomainException,
  PaymentNotFoundException,
} from '@domain/exceptions/domain.exception';

describe('RefundPaymentUseCase', () => {
  let useCase: RefundPaymentUseCase;
  let paymentRepository: jest.Mocked<PaymentRepository>;

  beforeEach(() => {
    paymentRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
    };
    useCase = new RefundPaymentUseCase(paymentRepository);
  });

  function createSucceededPayment(): Payment {
    const payment = Payment.create({
      id: 'pay-test-1',
      userId: 'user-1',
      amount: Money.from('100.00', 'USD'),
      provider: PaymentProvider.STRIPE,
    });
    payment.start();
    payment.succeed('ch_123');
    return payment;
  }

  it('should successfully execute a full refund when amount is omitted', async () => {
    const payment = createSucceededPayment();
    paymentRepository.findById.mockResolvedValue(payment);

    const result = await useCase.execute({
      paymentId: 'pay-test-1',
    });

    expect(result.status).toBe(PaymentStatus.REFUNDED);
    expect(result.totalRefunded).toBe('100.0000');
    expect(result.refundableAmount).toBe('0.0000');
    expect(result.refundTransactionId).toBeDefined();
    expect(paymentRepository.save).toHaveBeenCalledWith(payment);
  });

  it('should successfully execute a partial refund with specified amount', async () => {
    const payment = createSucceededPayment();
    paymentRepository.findById.mockResolvedValue(payment);

    const result = await useCase.execute({
      paymentId: 'pay-test-1',
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
      useCase.execute({ paymentId: 'non-existent' }),
    ).rejects.toThrow(PaymentNotFoundException);

    expect(paymentRepository.save).not.toHaveBeenCalled();
  });

  it('should propagate DomainException when domain invariants are violated', async () => {
    const payment = Payment.create({
      id: 'pay-created',
      userId: 'user-1',
      amount: Money.from('100.00', 'USD'),
      provider: PaymentProvider.STRIPE,
    });
    paymentRepository.findById.mockResolvedValue(payment);

    await expect(
      useCase.execute({ paymentId: 'pay-created' }),
    ).rejects.toThrow(DomainException);

    expect(paymentRepository.save).not.toHaveBeenCalled();
  });
});
