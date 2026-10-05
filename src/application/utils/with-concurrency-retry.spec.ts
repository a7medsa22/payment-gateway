import { withConcurrencyRetry } from './with-concurrency-retry';
import { ConcurrencyException } from '@domain/exceptions/domain.exception';

describe('withConcurrencyRetry', () => {
  it('should return result immediately if fn succeeds', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await withConcurrencyRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on ConcurrencyException and return when successful', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new ConcurrencyException('agg-1'))
      .mockResolvedValueOnce('success');

    const result = await withConcurrencyRetry(fn, 3);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw if max attempts reached', async () => {
    const fn = jest
      .fn()
      .mockRejectedValue(new ConcurrencyException('agg-1'));

    await expect(withConcurrencyRetry(fn, 3)).rejects.toThrow(ConcurrencyException);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry on other errors and rethrow immediately', async () => {
    const fn = jest
      .fn()
      .mockRejectedValue(new Error('unrelated error'));

    await expect(withConcurrencyRetry(fn, 3)).rejects.toThrow('unrelated error');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
