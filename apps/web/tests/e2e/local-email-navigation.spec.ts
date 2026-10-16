import { expect, type Page, test } from '@playwright/test';

import { gotoApp, LOCAL_E2E, uniqueE2EText } from './helpers/local-app';

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
  await gotoApp(page, '/mail');
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
    await expect(page).toHaveURL(/\/app\/mail\b/);

    await page.keyboard.press('ControlOrMeta+k');
    const menu = page.getByRole('dialog');
    // The list is virtualized, so narrow it to one command at a time.
    const query = menu.getByRole('textbox');
    await query.fill('Go to Noise');
    await expect(menu).toContainText(/Go to Noise\s*G\s*then\s*O/i);
    await query.fill('Go to Signal');
    await expect(menu).toContainText(/Go to Signal\s*G\s*then\s*I/i);
    // Inside Email both of Home's keys belong to Email, so it shows none.
    await query.fill('Go to Home');
    await expect(menu).toContainText('Go to Home');
    await expect(menu).not.toContainText(/Go to Home\s*(G|H|I)\b/);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test('g l picks a tag, and Escape leaves the tag view for Signal', async ({
    page,
  }) => {
    await openEmail(page);
    const tagName = uniqueE2EText('Email nav');
    await page.getByRole('button', { name: 'New tag' }).click();
    await page.getByPlaceholder('Tag name').fill(tagName);
    await page.getByRole('button', { name: /^Save/ }).click();
    const tagRow = page
      .getByRole('navigation', { name: 'Tags' })
      .getByRole('button', { name: tagName });
    await expect(tagRow).toBeVisible();

    await page.getByRole('grid', { name: 'Email' }).focus();
    await goTo(page, 'l');
    const picker = page.getByRole('dialog');
    const query = picker.getByPlaceholder('Go to tag...');
    await expect(query).toBeFocused();
    await expect(picker.getByText('docs', { exact: true })).toBeVisible();
    await query.fill(tagName);
    // The starter `docs` tag drops out once the debounced query applies.
    await expect(picker.getByText('docs', { exact: true })).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(picker).toHaveCount(0);
    await expectEmailTab(page, 'All');
    await expect(tagRow).toHaveAttribute('aria-current', 'page');

    await page.getByRole('grid', { name: 'Email' }).focus();
    await page.keyboard.press('Escape');
    await expectEmailTab(page, 'Signal');
    await expect(tagRow).not.toHaveAttribute('aria-current', 'page');
  });

  test('other g keys keep their app destinations', async ({ page }) => {
    await openEmail(page);
    await goTo(page, 'f');
    await expect(page).toHaveURL(/\/app\/drive\b/);
    await goTo(page, 'e');
    await expect(page).toHaveURL(/\/app\/mail\b/);
  });
});
