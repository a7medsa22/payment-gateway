import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ApiKeyRepository, MerchantContext } from '@infrastructure/auth/repositories/api-key.repository';

export const MERCHANT_CONTEXT_KEY = 'merchantContext';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const [scheme, key] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !key) {
      throw new UnauthorizedException(
        'Invalid Authorization format. Expected: Bearer <api_key>',
      );
    }

    if (!key.startsWith('sk_live_')) {
      throw new UnauthorizedException('Invalid API key format');
    }

    const merchantContext = await this.apiKeyRepository.findByKey(key);

    if (!merchantContext) {
      this.logger.warn(`Invalid API key attempt: ${key.substring(0, 12)}...`);
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    // Attach merchant context to request for downstream extraction
    request[MERCHANT_CONTEXT_KEY] = merchantContext;

    return true;
  }
}
