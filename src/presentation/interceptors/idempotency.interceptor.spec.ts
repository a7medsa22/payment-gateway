import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyStore, IdempotencyRecord } from '@infrastructure/cache/idempotency-store';
import { MERCHANT_CONTEXT_KEY } from '../guards/api-key.guard';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let mockStore: jest.Mocked<IdempotencyStore>;
  let mockReflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    mockStore = {
      tryAcquire: jest.fn(),
      complete: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      hashBody: jest.fn().mockReturnValue('mock_hash_123'),
    } as unknown as jest.Mocked<IdempotencyStore>;

    mockReflector = {
      get: jest.fn().mockReturnValue(HttpStatus.CREATED),
    } as unknown as jest.Mocked<Reflector>;

    interceptor = new IdempotencyInterceptor(mockStore, mockReflector);
  });

  function createMockContext(
    method = 'POST',
    path = '/api/v1/payments',
    headers: Record<string, string> = { 'idempotency-key': 'valid_idemp_key_123' },
    body: any = { amount: '100.00' },
    merchantId?: string,
  ): { context: ExecutionContext; response: any } {
    const response = {
      setHeader: jest.fn(),
      status: jest.fn(),
    };

    const request = {
      method,
      path,
      headers,
      body,
      [MERCHANT_CONTEXT_KEY]: merchantId ? { merchantId } : undefined,
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      getHandler: () => ({}),
    } as unknown as ExecutionContext;

    return { context, response };
  }

  it('should bypass non-POST requests', (done) => {
    const { context } = createMockContext('GET');
    const next = { handle: () => of('get_result') };

    interceptor.intercept(context, next).subscribe({
      next: (val) => {
        expect(val).toBe('get_result');
        expect(mockStore.tryAcquire).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should bypass webhook requests', (done) => {
    const { context } = createMockContext('POST', '/api/v1/webhooks/stripe');
    const next = { handle: () => of('webhook_result') };

    interceptor.intercept(context, next).subscribe({
      next: (val) => {
        expect(val).toBe('webhook_result');
        expect(mockStore.tryAcquire).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should throw BadRequestException when Idempotency-Key header is missing', () => {
    const { context } = createMockContext('POST', '/api/v1/payments', {});
    const next = { handle: () => of('ok') };

    expect(() => interceptor.intercept(context, next)).toThrow(
      new BadRequestException('A valid Idempotency-Key header (8–255 chars) is required'),
    );
  });

  it('should throw BadRequestException when Idempotency-Key header is too short', () => {
    const { context } = createMockContext('POST', '/api/v1/payments', {
      'idempotency-key': 'short',
    });
    const next = { handle: () => of('ok') };

    expect(() => interceptor.intercept(context, next)).toThrow(
      new BadRequestException('A valid Idempotency-Key header (8–255 chars) is required'),
    );
  });

  it('should process new request, cache response, and return result', (done) => {
    const { context } = createMockContext(
      'POST',
      '/api/v1/payments',
      { 'idempotency-key': 'valid_key_123' },
      { amount: '50.00' },
      'merchant_abc',
    );
    mockStore.tryAcquire.mockResolvedValueOnce(null); // Lock acquired
    const next = { handle: () => of({ id: 'pay_new_1' }) };

    interceptor.intercept(context, next).subscribe({
      next: (val) => {
        expect(val).toEqual({ id: 'pay_new_1' });
        expect(mockStore.tryAcquire).toHaveBeenCalledWith(
          'merchant_abc',
          'valid_key_123',
          'mock_hash_123',
        );
        expect(mockStore.complete).toHaveBeenCalledWith(
          'merchant_abc',
          'valid_key_123',
          'mock_hash_123',
          HttpStatus.CREATED,
          { id: 'pay_new_1' },
        );
        done();
      },
    });
  });

  it('should return 409 ConflictException when request with same key is IN_FLIGHT', (done) => {
    const { context } = createMockContext(
      'POST',
      '/api/v1/payments',
      { 'idempotency-key': 'valid_key_123' },
      { amount: '50.00' },
      'merchant_abc',
    );
    const inFlightRecord: IdempotencyRecord = {
      status: 'IN_FLIGHT',
      bodyHash: 'mock_hash_123',
    };
    mockStore.tryAcquire.mockResolvedValueOnce(inFlightRecord);
    const next = { handle: () => of('not_reached') };

    interceptor.intercept(context, next).subscribe({
      error: (err) => {
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.message).toBe('A request with this Idempotency-Key is still processing');
        done();
      },
    });
  });

  it('should return 422 UnprocessableEntityException when same key reused with different bodyHash', (done) => {
    const { context } = createMockContext(
      'POST',
      '/api/v1/payments',
      { 'idempotency-key': 'valid_key_123' },
      { amount: '50.00' },
      'merchant_abc',
    );
    const mismatchRecord: IdempotencyRecord = {
      status: 'DONE',
      bodyHash: 'different_hash_999',
    };
    mockStore.tryAcquire.mockResolvedValueOnce(mismatchRecord);
    const next = { handle: () => of('not_reached') };

    interceptor.intercept(context, next).subscribe({
      error: (err) => {
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        expect(err.message).toBe('Idempotency-Key reused with a different request body');
        done();
      },
    });
  });

  it('should replay completed response with Idempotency-Replayed header', (done) => {
    const { context, response } = createMockContext(
      'POST',
      '/api/v1/payments',
      { 'idempotency-key': 'valid_key_123' },
      { amount: '50.00' },
      'merchant_abc',
    );
    const doneRecord: IdempotencyRecord = {
      status: 'DONE',
      bodyHash: 'mock_hash_123',
      statusCode: HttpStatus.CREATED,
      body: { id: 'cached_payment_1' },
    };
    mockStore.tryAcquire.mockResolvedValueOnce(doneRecord);
    const next = { handle: () => of('not_reached') };

    interceptor.intercept(context, next).subscribe({
      next: (val) => {
        expect(val).toEqual({ id: 'cached_payment_1' });
        expect(response.setHeader).toHaveBeenCalledWith('Idempotency-Replayed', 'true');
        expect(response.status).toHaveBeenCalledWith(HttpStatus.CREATED);
        done();
      },
    });
  });

  it('should release lock and rethrow error when handler throws', (done) => {
    const { context } = createMockContext(
      'POST',
      '/api/v1/payments',
      { 'idempotency-key': 'valid_key_123' },
      { amount: '50.00' },
      'merchant_abc',
    );
    mockStore.tryAcquire.mockResolvedValueOnce(null);
    const handlerError = new Error('Database exploded');
    const next = { handle: () => throwError(() => handlerError) };

    interceptor.intercept(context, next).subscribe({
      error: (err) => {
        expect(err).toBe(handlerError);
        expect(mockStore.release).toHaveBeenCalledWith('merchant_abc', 'valid_key_123');
        done();
      },
    });
  });
});
