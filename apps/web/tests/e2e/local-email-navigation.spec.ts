import { expect, type Page, test } from '@playwright/test';

import { gotoApp, LOCAL_E2E } from './helpers/local-app';

test.skip(!LOCAL_E2E, 'local email navigation tests require LOCAL_E2E=true');

function emailTab(page: Page, label: string) {
  return page
    .getByRole('navigation', { name: 'Email tabs' })
    .getByRole('button', { name: label, exact: true });
}

async function expectEmailTab(page: Page, label: string) {
  await expect(emailTab(page, label)).toHaveAttribute('aria-current', 'page');
}

async function openEmail(page: Page) {
  await gotoApp(page, '/component/mail');
  await expectEmailTab(page, 'Signal');
  await page.getByRole('grid', { name: 'Email' }).focus();
}

async function goTo(page: Page, key: string) {
  await page.keyboard.press('g');
  await page.keyboard.press(key);
}

test.describe('local email keyboard navigation', () => {
  test.describe.configure({ timeout: 60_000 });

  test('Escape returns to Signal from every other tab', async ({ page }) => {
    await openEmail(page);
    for (const label of ['Noise', 'Archived', 'Sent', 'Drafts', 'Reminders']) {
      await emailTab(page, label).click();
      await expectEmailTab(page, label);
      await page.keyboard.press('Escape');
      await expectEmailTab(page, 'Signal');
    }
  });

  test('Escape steps from a search back to bare Signal', async ({ page }) => {
    await openEmail(page);
    await emailTab(page, 'Noise').click();
    const search = page.getByRole('searchbox', { name: 'Search email' });
    await search.fill('invoice');
    await page.keyboard.press('Escape');
    // The first Escape only leaves the field; the query stays.
    await expect(search).not.toBeFocused();
    await expect(search).toHaveValue('invoice');
    await expectEmailTab(page, 'Noise');
    await page.keyboard.press('Escape');
    await expectEmailTab(page, 'Signal');
    await expect(search).toHaveValue('');
    // At bare Signal there is nothing left to leave.
    await page.keyboard.press('Escape');
    await expectEmailTab(page, 'Signal');
  });

  test('g shortcuts switch email tabs and are listed in the command menu', async ({
    page,
  }) => {
    await openEmail(page);
    for (const [key, label] of [
      ['o', 'Noise'],
      ['e', 'Archived'],
      ['t', 'Sent'],
      ['d', 'Drafts'],
      ['h', 'Reminders'],
      ['i', 'Signal'],
    ] as const) {
      await goTo(page, key);
      await expectEmailTab(page, label);
    }
    await expect(page).toHaveURL(/\/app\/component\/mail/);

    await page.keyboard.press('ControlOrMeta+k');
    const menu = page.getByRole('dialog');
    await menu.getByRole('textbox').fill('Go to Noise');
    await expect(menu.getByText('Go to Noise', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test('other g keys keep their app destinations', async ({ page }) => {
    await openEmail(page);
    await goTo(page, 'f');
    await expect(page).toHaveURL(/\/app\/component\/documents/);
    await goTo(page, 'e');
    await expect(page).toHaveURL(/\/app\/component\/mail/);
  });
});
