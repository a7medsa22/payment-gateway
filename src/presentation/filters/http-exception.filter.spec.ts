import { ArgumentsHost, HttpStatus, BadRequestException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import {
  DomainException,
  PaymentException,
  PaymentNotFoundException,
} from '@domain/exceptions/domain.exception';
import { PaymentGatewayException } from '@infrastructure/gateways/payment-gateway.exception';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockStatus: jest.Mock;
  let mockJson: jest.Mock;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });

    const mockResponse = {
      status: mockStatus,
    };
    const mockRequest = {
      method: 'POST',
      url: '/api/v1/payments',
    };

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;
  });

  it('should map PaymentNotFoundException to 404', () => {
    const error = new PaymentNotFoundException('Payment not found');

    filter.catch(error, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        error: 'PaymentNotFoundException',
        message: 'Payment not found',
        timestamp: expect.any(String),
      }),
    );
  });

  it('should map PaymentException to 422', () => {
    const error = new PaymentException('Cannot refund uncompleted payment');

    filter.catch(error, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        error: 'PaymentException',
        message: 'Cannot refund uncompleted payment',
      }),
    );
  });

  it('should map DomainException to 400', () => {
    const error = new DomainException('Unsupported currency XYZ');

    filter.catch(error, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'DomainException',
        message: 'Unsupported currency XYZ',
      }),
    );
  });

  it('should map PaymentGatewayException to 502', () => {
    const error = new PaymentGatewayException('Stripe card declined');

    filter.catch(error, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 502,
        error: 'PaymentGatewayException',
        message: 'Stripe card declined',
      }),
    );
  });

  it('should map NestJS HttpException properly', () => {
    const error = new BadRequestException('Validation failed');

    filter.catch(error, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
      }),
    );
  });

  it('should map unknown errors to 500', () => {
    const error = new Error('Database connection failed unexpectedly');

    filter.catch(error, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        error: 'InternalServerError',
        message: 'Database connection failed unexpectedly',
      }),
    );
  });
});
