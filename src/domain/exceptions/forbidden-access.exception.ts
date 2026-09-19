import { DomainException } from './domain.exception';

/**
 * Thrown when a user attempts to access or mutate a resource they do not own.
 * Maps to HTTP 403 Forbidden at the presentation layer.
 */
export class ForbiddenAccessException extends DomainException {
  constructor(message = 'Access to this resource is forbidden') {
    super(message);
    this.name = 'ForbiddenAccessException';
    Error.captureStackTrace(this, this.constructor);
  }
}
