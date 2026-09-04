import { GetPaymentUseCase } from './get-payment.use-case';
import { PaymentRepository } from '@application/ports/payment.repository';
import { Payment } from '@domain/aggregates/payment.aggregate';
import { Money } from '@domain/value-objects/money.vo';
import { PaymentProvider, PaymentStatus } from '@domain/enums';
import { PaymentNotFoundException } from '@domain/exceptions/domain.exception';

describe('GetPaymentUseCase', () => {
  let useCase: GetPaymentUseCase;
  let paymentRepository: jest.Mocked<PaymentRepository>;

  beforeEach(() => {
    paymentRepository = {
      save: jest.fn(),
      findById: jest.fn(),
    };
    useCase = new GetPaymentUseCase(paymentRepository);
  });

  it('should return detailed payment DTO when payment exists', async () => {
    const payment = Payment.create({
      id: 'pay-get-1',
      userId: 'user-get-1',
      amount: Money.from('250.00', 'USD'),
      provider: PaymentProvider.STRIPE,
      description: 'Consulting fee',
    });
    payment.start();
    payment.succeed('ch_stripe_get');
    payment.refund(Money.from('50.00', 'USD'), 'Partial return');

    paymentRepository.findById.mockResolvedValue(payment);

    const result = await useCase.execute('pay-get-1');

    expect(result.id).toBe('pay-get-1');
    expect(result.userId).toBe('user-get-1');
    expect(result.amount).toBe('250.0000');
    expect(result.currency).toBe('USD');
    expect(result.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    expect(result.provider).toBe(PaymentProvider.STRIPE);
    expect(result.totalCharged).toBe('250.0000');
    expect(result.totalRefunded).toBe('50.0000');
    expect(result.refundableAmount).toBe('200.0000');
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].type).toBe('charge');
    expect(result.transactions[1].type).toBe('partial_refund');
  });

  it('should throw PaymentNotFoundException when payment does not exist', async () => {
    paymentRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute('non-existent')).rejects.toThrow(
      PaymentNotFoundException,
    );
  });
});
