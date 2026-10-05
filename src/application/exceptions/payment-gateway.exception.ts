export class PaymentGatewayException extends Error {
  public readonly cause?: unknown;

  /**
   * true  = outcome UNKNOWN (timeout, connection reset, provider 5xx).
   *         The provider MAY have executed the operation → never mark FAILED.
   * false = provider definitively rejected the request (decline, invalid, auth, rate limit).
   */
  constructor(
    message: string,
    public readonly ambiguous: boolean,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = 'PaymentGatewayException';
    this.cause = options?.cause;
    Error.captureStackTrace(this, this.constructor);
  }
}
