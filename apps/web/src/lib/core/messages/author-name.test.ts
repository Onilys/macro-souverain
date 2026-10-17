import { expect, it } from 'vitest';
import { displayAuthorName } from './author-name';

it('preserves all provider author labels, including literal test-number suffixes', () => {
  expect(displayAuthorName('+1 555-643-5162 (test number)')).toBe(
    '+1 555-643-5162 (test number)'
  );
  expect(displayAuthorName('Jamie Chen')).toBe('Jamie Chen');
  expect(displayAuthorName('Studio (test number)')).toBe(
    'Studio (test number)'
  );
  expect(displayAuthorName('@cagarwal29')).toBe('@cagarwal29');
});
