import { describe, expect, test } from 'vitest';
import { ExponentialBackoff } from '../../';

describe('Testsuite for ExponentialBackoff', () => {
  test('Initialization should throw on negative base', () => {
    expect(() => new ExponentialBackoff(-1001)).toThrow();
    expect(() => new ExponentialBackoff(-42)).toThrow();
    expect(() => new ExponentialBackoff(-1)).toThrow();
  });

  test('Initialization should not throw on zero base', () => {
    expect(() => new ExponentialBackoff(0)).not.toThrow();
  });

  test('Initialization should throw on negative max-exponent', () => {
    expect(() => new ExponentialBackoff(42, -1001)).toThrow();
    expect(() => new ExponentialBackoff(42, -42)).toThrow();
    expect(() => new ExponentialBackoff(42, -1)).toThrow();
  });

  test('Initialization should not throw on zero max-exponent', () => {
    expect(() => new ExponentialBackoff(42, 0)).not.toThrow();
  });

  test('Backoff without max-exponent should double with each next', () => {
    const backoff = new ExponentialBackoff(2);
    for (let i = 0; i < 10; i++) {
      expect(backoff.current).toBe(2 * Math.pow(2, i));
      expect(backoff.next()).toBe(2 * Math.pow(2, i + 1));
      expect(backoff.current).toBe(2 * Math.pow(2, i + 1));
    }
  });

  test('Backoff with max-exponent should not exceed max-exponent', () => {
    const backoff = new ExponentialBackoff(2, 3);
    for (let i = 0; i < 10; i++) {
      expect(backoff.current).toBe(2 * Math.pow(2, Math.min(3, i)));
      expect(backoff.next()).toBe(2 * Math.pow(2, Math.min(3, i + 1)));
      expect(backoff.current).toBe(2 * Math.pow(2, Math.min(3, i + 1)));
    }
  });

  test('Backoff should be equal to the given base after reset', () => {
    const backoff = new ExponentialBackoff(42);
    backoff.next();
    backoff.reset();
    expect(backoff.current).toBe(42);
  });

  test('Retries should be incremented with each next', () => {
    const backoff = new ExponentialBackoff(42);
    for (let i = 0; i < 10; i++) {
      expect(backoff.retries).toBe(i);
      backoff.next();
    }
  });

  test('Retries should be zero after reset', () => {
    const backoff = new ExponentialBackoff(42);
    for (let i = 0; i < 100; i++) {
      backoff.next();
    }
    backoff.reset();
    expect(backoff.retries).toBe(0);
  });
});
