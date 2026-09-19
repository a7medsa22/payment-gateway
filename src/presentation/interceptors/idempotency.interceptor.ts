import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, of, tap } from 'rxjs';
import { Request, Response } from 'express';

/**
 * Idempotency Interceptor (Phase 5 skeleton — in-memory store).
 *
 * Reads the `Idempotency-Key` header. If a response for that key already
 * exists in the in-memory cache, it returns the cached result immediately.
 * Otherwise, it lets the request proceed and caches the response.
 *
 * ⚠️  RISK: The in-memory Map is ephemeral. It is reset on every server
 * restart and is NOT shared across multiple instances (horizontal scaling).
 * Production requires a persistent store (Redis). See RISK_REGISTRY.md.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  /**
   * In-memory idempotency cache.
   * Key: idempotency key string.
   * Value: serialized response body.
   */
  private readonly cache = new Map<string, unknown>();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Only apply idempotency to mutating methods
    if (!['POST', 'PUT', 'PATCH'].includes(request.method)) {
      return next.handle();
    }

    const idempotencyKey = request.headers['idempotency-key'] as
      | string
      | undefined;

    if (!idempotencyKey) {
      return next.handle();
    }

    const cached = this.cache.get(idempotencyKey);
    if (cached !== undefined) {
      this.logger.log(
        `Idempotency hit for key "${idempotencyKey}" — returning cached response.`,
      );
      // Return cached result wrapped in an Observable
      response.setHeader('Idempotency-Replayed', 'true');
      return of(cached);
    }

    return next.handle().pipe(
      tap((responseBody) => {
        this.cache.set(idempotencyKey, responseBody);
        this.logger.log(
          `Cached response for idempotency key "${idempotencyKey}".`,
        );
      }),
    );
  }
}
