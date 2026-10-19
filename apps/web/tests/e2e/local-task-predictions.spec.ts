import { expect, test } from '@playwright/test';

test.skip(
  process.env.LOCAL_JEV_E2E !== 'true',
  'requires an authenticated local stack with Jev configured; calls the live provider'
);

test('title edits distinguish importance, urgency, and negation', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(() =>
    localStorage.removeItem('task-composer-draft')
  );
  await page.goto('/app/component/task-compose');
  const composer = page
    .locator('.portal-scope')
    .filter({ has: page.getByRole('button', { name: /^Create Task/ }) })
    .last();
  const title = composer.locator('[contenteditable="true"]').first();
  const initial = page.waitForResponse(
    (response) =>
      response.url().endsWith('/decisions') &&
      response.request().method() === 'POST',
    { timeout: 40_000 }
  );
  await title.fill('kill all ui');
  expect((await initial).status()).toBe(200);
  await title.press('End');
  await title.pressSequentially(' (important)');
  await expect(
    composer.getByRole('button', { name: 'High', exact: true })
  ).toBeVisible({ timeout: 40_000 });

  await title.fill('kill all ui (urgent)');
  await expect(
    composer.getByRole('button', { name: 'Urgent', exact: true })
  ).toBeVisible({ timeout: 40_000 });

  await title.fill('kill all ui (not important)');
  await expect(
    composer.getByRole('button', { name: 'Low', exact: true })
  ).toBeVisible({ timeout: 40_000 });
});
