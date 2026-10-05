import { ConcurrencyException } from '@domain/exceptions/domain.exception';

/** Re-runs `fn` (which must reload the aggregate) on optimistic-lock conflicts. */
export async function withConcurrencyRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof ConcurrencyException) || i >= attempts) {
        throw error;
      }
    }
  }
}
