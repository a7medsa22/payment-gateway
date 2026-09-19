import { PaymentController } from './payment.controller';
import { CreatePaymentUseCase } from '@application/use-cases/create-payment/create-payment.use-case';
import { GetPaymentUseCase } from '@application/use-cases/get-payment/get-payment.use-case';
import { RefundPaymentUseCase } from '@application/use-cases/refund-payment/refund-payment.use-case';
import { PaymentProvider, PaymentStatus } from '@domain/enums';
import { CreatePaymentRequestDto } from '../dtos/create-payment.request.dto';
import { RefundPaymentRequestDto } from '../dtos/refund-payment.request.dto';

describe('PaymentController', () => {
  let controller: PaymentController;
  let mockCreateUseCase: jest.Mocked<CreatePaymentUseCase>;
  let mockGetUseCase: jest.Mocked<GetPaymentUseCase>;
  let mockRefundUseCase: jest.Mocked<RefundPaymentUseCase>;

  beforeEach(() => {
    mockCreateUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreatePaymentUseCase>;

    mockGetUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetPaymentUseCase>;

    mockRefundUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<RefundPaymentUseCase>;

    controller = new PaymentController(
      mockCreateUseCase,
      mockGetUseCase,
      mockRefundUseCase,
    );
  });

  describe('create()', () => {
    it('should delegate to CreatePaymentUseCase and return result', async () => {
      const dto: CreatePaymentRequestDto = {
        userId: 'usr_123',
        amount: '100.00',
        currency: 'USD',
        provider: PaymentProvider.STRIPE,
        description: 'Test payment',
      };

      const expectedResult = {
        id: 'pay_123',
        userId: 'usr_123',
        amount: '100.00',
        currency: 'USD',
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.STRIPE,
        providerPaymentId: 'pi_stripe_123',
        clientSecret: 'secret_123',
        createdAt: new Date(),
      };

      mockCreateUseCase.execute.mockResolvedValue(expectedResult);

      const result = await controller.create(dto);

      expect(result).toBe(expectedResult);
      expect(mockCreateUseCase.execute).toHaveBeenCalledWith({
        userId: 'usr_123',
        amount: '100.00',
        currency: 'USD',
        provider: PaymentProvider.STRIPE,
        description: 'Test payment',
      });
    });
  });

  describe('findOne()', () => {
    it('should delegate to GetPaymentUseCase and return payment detail', async () => {
      const expectedDetail = {
        id: 'pay_123',
        userId: 'usr_123',
        amount: '100.00',
        currency: 'USD',
        status: PaymentStatus.SUCCEEDED,
        provider: PaymentProvider.STRIPE,
        totalCharged: '100.00',
        totalRefunded: '0.00',
        refundableAmount: '100.00',
        transactions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetUseCase.execute.mockResolvedValue(expectedDetail);

      const result = await controller.findOne('pay_123', 'usr_123');

      expect(result).toBe(expectedDetail);
      expect(mockGetUseCase.execute).toHaveBeenCalledWith('pay_123', 'usr_123');
    });
  });

  describe('refund()', () => {
    it('should delegate to RefundPaymentUseCase with param id and body fields', async () => {
      const refundDto: RefundPaymentRequestDto = {
        userId: 'usr_123',
        amount: '50.00',
        currency: 'USD',
        reason: 'Customer return',
      };

      const expectedResult = {
        paymentId: 'pay_123',
        status: PaymentStatus.PARTIALLY_REFUNDED,
        amount: '100.00',
        currency: 'USD',
        totalRefunded: '50.00',
        refundableAmount: '50.00',
        reason: 'Customer return',
      };

      mockRefundUseCase.execute.mockResolvedValue(expectedResult);

      const result = await controller.refund('pay_123', refundDto);

      expect(result).toBe(expectedResult);
      expect(mockRefundUseCase.execute).toHaveBeenCalledWith({
        paymentId: 'pay_123',
        userId: 'usr_123',
        amount: '50.00',
        currency: 'USD',
        reason: 'Customer return',
      });
    });
  });
});
