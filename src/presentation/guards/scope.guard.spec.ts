import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ScopeGuard } from './scope.guard';
import { MERCHANT_CONTEXT_KEY } from './api-key.guard';
import { MerchantContext } from '@infrastructure/auth/repositories/api-key.repository';

describe('ScopeGuard', () => {
  let guard: ScopeGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    guard = new ScopeGuard(reflector);
  });

  function createMockContext(merchantContext?: MerchantContext): ExecutionContext {
    const request: Record<string, any> = {};
    if (merchantContext) {
      request[MERCHANT_CONTEXT_KEY] = merchantContext;
    }
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it('should allow access if no scopes are required', () => {
    reflector.getAllAndOverride.mockReturnValue(null);
    const context = createMockContext();

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException if merchant context is missing on protected endpoint', () => {
    reflector.getAllAndOverride.mockReturnValue(['payments:create']);
    const context = createMockContext();

    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException('Merchant context not found'),
    );
  });

  it('should throw ForbiddenException if merchant lacks required scopes', () => {
    reflector.getAllAndOverride.mockReturnValue(['payments:create', 'payments:refund']);
    const context = createMockContext({
      merchantId: 'mch_1',
      merchantName: 'Store',
      scopes: ['payments:create'], // missing payments:refund
    });

    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException(
        'Insufficient scopes. Required: payments:create, payments:refund',
      ),
    );
  });

  it('should allow access if merchant has all required scopes', () => {
    reflector.getAllAndOverride.mockReturnValue(['payments:create']);
    const context = createMockContext({
      merchantId: 'mch_1',
      merchantName: 'Store',
      scopes: ['payments:create', 'payments:read'],
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
