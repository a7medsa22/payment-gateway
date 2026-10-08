export class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainException';
    Error.captureStackTrace(this, this.constructor);
  }
}
export class PaymentException extends DomainException {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentException';
    Error.captureStackTrace(this, this.constructor);
  }
}
export class PaymentNotFoundException extends PaymentException {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentNotFoundException';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConcurrencyException extends DomainException {
  constructor(aggregateId: string) {
    super(`Aggregate ${aggregateId} was modified concurrently. Please retry.`);
    this.name = 'ConcurrencyException';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class IdempotencyKeyMismatchException extends DomainException {
  constructor(message = 'Idempotency-Key reused with different parameters') {
    super(message);
    this.name = 'IdempotencyKeyMismatchException';
    Error.captureStackTrace(this, this.constructor);
  }
}

