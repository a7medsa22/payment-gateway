import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

/**
 * Set of header and body field keys that should never be logged.
 * These are redacted before any log output to prevent information disclosure.
 */
const SENSITIVE_KEYS = new Set([
  'secretkey',
  'webhooksecret',
  'token',
  'password',
  'authorization',
  'stripe-signature',
  'clientsecret',
  'client_secret',
  'apikey',
  'api_key',
]);

/**
 * Recursively redacts sensitive keys from an object before logging.
 */
function redactSensitiveFields(obj: unknown, depth = 0): unknown {
  if (depth > 10 || obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveFields(item, depth + 1));
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    redacted[key] = SENSITIVE_KEYS.has(key.toLowerCase())
      ? '[REDACTED]'
      : redactSensitiveFields(value, depth + 1);
  }
  return redacted;
}

/**
 * Global NestJS interceptor that logs incoming requests and outgoing responses
 * with sensitive fields (auth headers, secrets, tokens) redacted.
 *
 * This prevents accidental credential leakage in application logs (CWE-532).
 */
@Injectable()
export class SensitiveDataRedactionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SensitiveDataRedactionInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, body, headers } = request;
    const startTime = Date.now();

    // Redact sensitive request headers
    const safeHeaders = redactSensitiveFields(headers);
    const safeBody = redactSensitiveFields(body);

    this.logger.debug(
      `[REQUEST] ${method} ${url} — headers: ${JSON.stringify(safeHeaders)} — body: ${JSON.stringify(safeBody)}`,
    );

    return next.handle().pipe(
      tap((responseBody) => {
        const duration = Date.now() - startTime;
        const safeResponse = redactSensitiveFields(responseBody);
        this.logger.debug(
          `[RESPONSE] ${method} ${url} — ${duration}ms — body: ${JSON.stringify(safeResponse)}`,
        );
      }),
    );
  }
}
