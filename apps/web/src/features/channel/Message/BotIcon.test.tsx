import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { afterEach, expect, it, vi } from 'vitest';
import { BotIcon } from './BotIcon';

vi.mock('@ui', async () => await import('@ui/components/Avatar'));
afterEach(cleanup);

it('retries the original image once and retains the initial if both URLs fail', () => {
  const { container, getByText } = render(() => (
    <BotIcon name="pickle" avatarUrl="https://example.com/pickle.png" />
  ));
  const image = container.querySelector('img')!;
  expect(image.src).toBe('https://example.com/pickle.png?size=320');
  fireEvent.error(image);
  expect(image.src).toBe('https://example.com/pickle.png');
  fireEvent.error(image);
  expect(image.hasAttribute('data-failed')).toBe(true);
  expect(getByText('P')).toBeTruthy();
  fireEvent.load(image);
  expect(image.hasAttribute('data-failed')).toBe(false);
});
