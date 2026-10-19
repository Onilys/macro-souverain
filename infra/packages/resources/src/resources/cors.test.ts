import { describe, expect, test } from 'bun:test';
import { allowedOrigins } from './cors';

const fixedLocalPorts = ['http', 'https'].flatMap((scheme) =>
  Array.from({ length: 10 }, (_, i) => `${scheme}://localhost:${3000 + i}`)
);

describe('allowedOrigins', () => {
  test('prod allows only the fixed local ports', () => {
    const origins = allowedOrigins('prod');
    expect(origins.slice(0, fixedLocalPorts.length)).toEqual(fixedLocalPorts);
    expect(origins).not.toContain('http://localhost:*');
    expect(origins).not.toContain('https://localhost:*');
  });

  test('non-prod stacks allow any local port', () => {
    const prod = allowedOrigins('prod');
    for (const stack of ['dev', 'local']) {
      const origins = allowedOrigins(stack);
      expect(origins.slice(0, 2)).toEqual([
        'http://localhost:*',
        'https://localhost:*',
      ]);
      expect(origins.slice(2)).toEqual(prod.slice(fixedLocalPorts.length));
    }
  });

  test('each origin has at most one wildcard, as S3 requires', () => {
    for (const stack of ['dev', 'prod']) {
      for (const origin of allowedOrigins(stack)) {
        expect(origin.split('*').length).toBeLessThanOrEqual(2);
      }
    }
  });
});
