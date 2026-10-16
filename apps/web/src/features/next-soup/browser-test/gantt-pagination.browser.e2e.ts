import { expect, type Page, test } from '@playwright/test';

const timeline = (page: Page) =>
  page.getByLabel('Gantt timeline', { exact: true });
const requests = async (page: Page) =>
  ((await page.getByTestId('requests').textContent()) ?? '')
    .split(',')
    .filter(Boolean);
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue()
      : route.abort()
  );
  await page.goto('/gantt.html', { waitUntil: 'domcontentloaded' });
});

test('Gantt fills one viewport then follows group order while scrolling', async ({
  page,
}) => {
  await expect
    .poll(async () => (await requests(page)).length)
    .toBeGreaterThan(1);
  expect((await requests(page)).every((key) => key === 'a')).toBe(true);
  expect((await requests(page)).length).toBeLessThan(7);
  await expect(page.getByRole('button', { name: /load more/i })).toHaveCount(0);
  for (let i = 0; i < 6 && !(await requests(page)).includes('b'); i++) {
    const count = (await requests(page)).length;
    await timeline(page).evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect
      .poll(async () => (await requests(page)).length)
      .toBeGreaterThan(count);
  }
  await expect.poll(() => requests(page)).toContain('b');
  expect((await requests(page)).indexOf('b')).toBe(7);
  await expect(timeline(page)).toHaveCount(1);
});

test('Gantt pauses failed automatic requests until Retry and fills on resize', async ({
  page,
}) => {
  await expect
    .poll(async () => (await requests(page)).length)
    .toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Fail next' }).click();
  await timeline(page).evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const retry = page.getByRole('button', { name: 'Retry', exact: true }).last();
  await expect(retry).toBeVisible();
  const failedCount = (await requests(page)).length;
  await timeline(page).evaluate((element) => {
    element.dispatchEvent(new Event('scroll'));
  });
  expect((await requests(page)).length).toBe(failedCount);
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect
    .poll(async () => (await requests(page)).length)
    .toBeGreaterThan(failedCount);
  const beforeResize = (await requests(page)).length;
  await page.getByRole('button', { name: 'Resize', exact: true }).click();
  await expect
    .poll(async () => (await requests(page)).length)
    .toBeGreaterThan(beforeResize);
});

test('Gantt retains later rows on re-expansion and preserves the horizontal day', async ({
  page,
}) => {
  await expect
    .poll(async () => (await requests(page)).length)
    .toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Toggle a' }).click();
  await expect.poll(() => requests(page)).toContain('b');
  await timeline(page).evaluate((element) => {
    element.scrollTop = 88;
    element.scrollLeft += 50;
  });
  const row = page.getByRole('button', { name: /^b task 0:/ });
  await expect(row).toBeVisible();
  const before = (await row.boundingBox())!.y;
  const day = Number(
    await page
      .locator('[data-visible-day]')
      .first()
      .getAttribute('data-visible-day')
  );
  await page.getByRole('button', { name: 'Toggle a' }).click();
  await expect
    .poll(async () =>
      Math.abs(((await row.boundingBox())?.y ?? -10000) - before)
    )
    .toBeLessThan(3);
  await expect
    .poll(async () =>
      Math.abs(
        Number(
          await page
            .locator('[data-visible-day]')
            .first()
            .getAttribute('data-visible-day')
        ) - day
      )
    )
    .toBeLessThan(0.1);
  await expect(page.getByRole('button', { name: /load more/i })).toHaveCount(0);
});

test('Gantt keeps the drag source pinned while adding a preview in a later group', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'Mouse drag is desktop input; touch pagination is covered separately.'
  );
  await expect
    .poll(async () => (await requests(page)).length)
    .toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Toggle a' }).click();
  await expect.poll(() => requests(page)).toContain('b');
  // Keep the loaded snapshot fixed while checking drag occurrence geometry.
  await page.getByRole('button', { name: 'Toggle readiness' }).click();
  await page.getByRole('button', { name: 'Toggle a' }).click();
  await timeline(page).evaluate((element) => {
    element.scrollTop = 0;
  });
  const source = page.getByTitle('a task 0', { exact: true }).first();
  await expect(source).toBeVisible();
  const box = (await source.boundingBox())!;
  await page.mouse.move(box.x + 15, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 15, box.y + 25);
  const groupIndex = Number(
    await page.getByTestId('requests').getAttribute('data-group-b-index')
  );
  // Virtual headers are not mounted offscreen; scroll their source occurrence into view.
  await timeline(page).evaluate((element, index) => {
    element.scrollTop = index * 40;
  }, groupIndex);
  const target = page.getByRole('button', { name: /Group b/ });
  await expect(target).toBeVisible();
  const targetBox = (await target.boundingBox())!;
  await page.mouse.move(targetBox.x + 20, targetBox.y + 15);
  await expect(page.locator('[data-gantt-drop-preview]')).toHaveCount(1);
  await expect(source).toHaveCount(1);
  await page.mouse.up();
  await expect(page.getByTestId('moved')).toHaveText('a:b');
});

for (const mode of ['flat', 'date']) {
  test(`Gantt automatically pages ${mode} fallback rows without a Load More button`, async ({
    page,
  }) => {
    await page.goto(`/gantt.html?mode=${mode}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect
      .poll(async () => (await requests(page)).length)
      .toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: /load more/i })).toHaveCount(
      0
    );
    await page.getByRole('button', { name: 'Fail next' }).click();
    await timeline(page).evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const retry = page
      .getByRole('button', { name: 'Retry', exact: true })
      .last();
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(retry).toHaveCount(0);
  });
}

test('Gantt retains stale rows without pagination demands while the next query is pending', async ({
  page,
}) => {
  await expect
    .poll(async () => (await requests(page)).length)
    .toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Toggle readiness' }).click();
  const count = (await requests(page)).length;
  await page.getByRole('button', { name: 'Resize', exact: true }).click();
  await timeline(page).evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  // A pending query must not create repeated no-op demand on subsequent timer turns.
  await page.waitForTimeout(100);
  expect((await requests(page)).length).toBe(count);
  await expect(
    page.getByTitle('a task 0', { exact: true }).first()
  ).toBeAttached();
  await page.getByRole('button', { name: 'Toggle readiness' }).click();
  await expect
    .poll(async () => (await requests(page)).length)
    .toBeGreaterThan(count);
});
