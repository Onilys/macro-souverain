import { cleanup, render } from '@solidjs/testing-library';
import { afterEach, expect, it } from 'vitest';
import { DEMO_BOOKING_URL } from '../../../features/marketing/core/navigation';
import { DocsMarkdownScene, REST_T } from './DocsMarkdownScene';

afterEach(cleanup);

it('renders a named scheduling link instead of exposing its raw URL', () => {
  const view = render(() => <DocsMarkdownScene t={() => REST_T} />);
  const booking = view.getByRole('link', { name: 'Team check-in' });
  expect(booking.getAttribute('href')).toBe(DEMO_BOOKING_URL);
  expect(view.queryByText(DEMO_BOOKING_URL)).toBeNull();
});
