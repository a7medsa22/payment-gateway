import { IdempotencyKeyMismatchException } from '@domain/exceptions/domain.exception';

export class DuplicateIdempotencyKeyException extends Error {
  constructor(message = 'Duplicate idempotency key detected') {
    super(message);
    this.name = 'DuplicateIdempotencyKeyException';
    Error.captureStackTrace(this, this.constructor);
  }
}

export { IdempotencyKeyMismatchException };
