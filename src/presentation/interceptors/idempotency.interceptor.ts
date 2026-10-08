import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Observable, catchError, from, map, mergeMap, of, throwError } from 'rxjs';
import { Request, Response } from 'express';
import { IdempotencyStore } from '@infrastructure/cache/idempotency-store';
import { MERCHANT_CONTEXT_KEY } from '../guards/api-key.guard';

const KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,255}$/;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly store: IdempotencyStore,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    if (req.method !== 'POST' || req.path?.includes('/webhooks/')) {
      return next.handle();
    }

    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      throw new BadRequestException(
        'A valid Idempotency-Key header (8–255 chars) is required',
      );
    }

    const merchantId: string | undefined = (req as any)[MERCHANT_CONTEXT_KEY]
      ?.merchantId;
    if (!merchantId) {
      return next.handle(); // guards already handle unauthenticated calls
    }

    const bodyHash = this.store.hashBody({ path: req.path, body: req.body });
    const successStatus =
      this.reflector.get<number>(HTTP_CODE_METADATA, context.getHandler()) ??
      HttpStatus.CREATED;

    return from(this.store.tryAcquire(merchantId, key, bodyHash)).pipe(
      mergeMap((existing) => {
        if (!existing) {
          return next.handle().pipe(
            // await the cache write BEFORE emitting the response
            mergeMap((body) =>
              from(
                this.store.complete(
                  merchantId,
                  key,
                  bodyHash,
                  successStatus,
                  body,
                ),
              ).pipe(map(() => body)),
            ),
            // release the lock, then rethrow the ORIGINAL error
            catchError((err) =>
              from(this.store.release(merchantId, key)).pipe(
                mergeMap(() => throwError(() => err)),
              ),
            ),
          );
        }

        if (existing.bodyHash !== bodyHash) {
          throw new UnprocessableEntityException(
            'Idempotency-Key reused with a different request body',
          );
        }

        if (existing.status === 'IN_FLIGHT') {
          throw new ConflictException(
            'A request with this Idempotency-Key is still processing',
          );
        }

        res.setHeader('Idempotency-Replayed', 'true');
        res.status(existing.statusCode ?? successStatus);
        return of(existing.body);
      }),
    );
  }
}
