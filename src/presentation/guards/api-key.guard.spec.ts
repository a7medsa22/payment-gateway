import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard, MERCHANT_CONTEXT_KEY } from './api-key.guard';
import { ApiKeyRepository, MerchantContext } from '@infrastructure/auth/repositories/api-key.repository';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let mockApiKeyRepo: jest.Mocked<ApiKeyRepository>;

  beforeEach(() => {
    mockApiKeyRepo = {
      findByKey: jest.fn(),
      createKey: jest.fn(),
    } as unknown as jest.Mocked<ApiKeyRepository>;

    guard = new ApiKeyGuard(mockApiKeyRepo);
  });

  function createMockContext(headers: Record<string, string>): {
    context: ExecutionContext;
    request: Record<string, any>;
  } {
    const request: Record<string, any> = { headers };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    return { context, request };
  }

  it('should throw UnauthorizedException if Authorization header is missing', async () => {
    const { context } = createMockContext({});
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Missing Authorization header'),
    );
  });

  it('should throw UnauthorizedException if Authorization header is not Bearer', async () => {
    const { context } = createMockContext({
      authorization: 'Basic dXNlcjpwYXNz',
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(
        'Invalid Authorization format. Expected: Bearer <api_key>',
      ),
    );
  });

  it('should throw UnauthorizedException if API key format does not start with sk_live_', async () => {
    const { context } = createMockContext({
      authorization: 'Bearer invalid_prefix_key',
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid API key format'),
    );
  });

  it('should throw UnauthorizedException if API key is not found or revoked', async () => {
    mockApiKeyRepo.findByKey.mockResolvedValue(null);
    const { context } = createMockContext({
      authorization: 'Bearer sk_live_validformatbutnotfound',
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid or revoked API key'),
    );
  });

  it('should attach merchantContext to request and return true for valid API key', async () => {
    const merchant: MerchantContext = {
      merchantId: 'mch_123',
      merchantName: 'Store A',
      scopes: ['payments:create'],
    };
    mockApiKeyRepo.findByKey.mockResolvedValue(merchant);

    const { context, request } = createMockContext({
      authorization: 'Bearer sk_live_valid1234567890abcdef',
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request[MERCHANT_CONTEXT_KEY]).toEqual(merchant);
  });
});
