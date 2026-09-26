import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_SCOPES_KEY } from '../decorators/require-scopes.decorator';
import { MERCHANT_CONTEXT_KEY } from './api-key.guard';
import { MerchantContext } from '@infrastructure/auth/repositories/api-key.repository';

@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no scopes are required, allow access
    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const merchantContext: MerchantContext | undefined =
      request[MERCHANT_CONTEXT_KEY];

    if (!merchantContext) {
      throw new ForbiddenException('Merchant context not found');
    }

    const hasAllScopes = requiredScopes.every((scope) =>
      merchantContext.scopes.includes(scope),
    );

    if (!hasAllScopes) {
      throw new ForbiddenException(
        `Insufficient scopes. Required: ${requiredScopes.join(', ')}`,
      );
    }

    return true;
  }
}
