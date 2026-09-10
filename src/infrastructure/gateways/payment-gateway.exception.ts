export class PaymentGatewayException extends Error {
  public readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'PaymentGatewayException';
    this.cause = options?.cause;
    Error.captureStackTrace(this, this.constructor);
  }
}
