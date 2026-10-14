/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, expect, it } from 'vitest';
import { CustomerIdentity } from './customer-identity';

afterEach(cleanup);

it('keeps contact and account details behind one accessible provider icon', async () => {
  render(() => (
    <CustomerIdentity
      provider="whatsapp"
      name="Jamie Chen"
      phone="+1 202 555 0147"
      accountName="Macro"
    />
  ));
  const button = screen.getByRole('button', {
    name: 'WhatsApp conversation details',
  });
  expect(button.textContent).toBe('');
  expect(screen.queryByText('+1 202 555 0147')).toBeNull();
  fireEvent.click(button);
  expect(await screen.findByText('Jamie Chen')).toBeTruthy();
  expect(screen.getByText('+1 202 555 0147')).toBeTruthy();
  expect(screen.getByText('WhatsApp messages sent from Macro.')).toBeTruthy();
});

it('shows the full Instagram name and handle rather than forcing a first name', async () => {
  render(() => (
    <CustomerIdentity
      provider="instagram"
      name="Jamie Chen"
      handle="jamie.chen"
      accountName="macro"
    />
  ));
  fireEvent.click(
    screen.getByRole('button', { name: 'Instagram conversation details' })
  );
  expect(await screen.findByText('@jamie.chen')).toBeTruthy();
  expect(screen.getByText('Jamie Chen')).toBeTruthy();
  expect(screen.queryByText(/test account/i)).toBeNull();
});
