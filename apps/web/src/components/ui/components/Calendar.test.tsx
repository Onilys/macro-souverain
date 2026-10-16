import { cleanup, render, screen } from '@solidjs/testing-library';
import { afterEach, expect, it } from 'vitest';
import { Calendar } from './Calendar';

afterEach(cleanup);

it('heads the calendar with a month menu by default', () => {
  render(() => <Calendar initialMonth={new Date(2026, 9, 1)} />);
  expect(screen.getByRole('button', { name: 'Choose month' })).toBeTruthy();
});

it('can head the calendar with the month as text, leaving nothing to focus there', () => {
  render(() => (
    <Calendar monthMenu={false} initialMonth={new Date(2026, 9, 1)} />
  ));
  expect(screen.queryByRole('button', { name: 'Choose month' })).toBeNull();
  expect(screen.getByText('October 2026')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Go to next month' })).toBeTruthy();
});
