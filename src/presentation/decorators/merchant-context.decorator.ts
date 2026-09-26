import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { MERCHANT_CONTEXT_KEY } from '../guards/api-key.guard';
import { MerchantContext } from '@infrastructure/auth/repositories/api-key.repository';

export const MerchantCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): MerchantContext => {
    const request = ctx.switchToHttp().getRequest();
    return request[MERCHANT_CONTEXT_KEY];
  },
);
