import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue()
      : route.abort()
  );
});

test('board loads visible columns, pauses errors, and resumes after retry or horizontal scroll', async ({
  page,
}) => {
  await page.goto('/board.html', { waitUntil: 'domcontentloaded' });
  const requests = page.getByTestId('requests');
  await expect(requests).toHaveText(/^a(,a)*$/);
  await page.getByRole('button', { name: 'Fail next' }).click();
  const lane = page.locator('[data-kanban-board-scroll="a"]');
  await lane.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    page.getByRole('button', { name: 'Retry', exact: true })
  ).toBeVisible();
  const failedRequests = await requests.textContent();
  await lane.evaluate((element) => {
    element.dispatchEvent(new Event('scroll'));
  });
  await expect(requests).toHaveText(failedRequests!);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Retry', exact: true })
  ).toHaveCount(0);
  await expect(requests).not.toHaveText(failedRequests!);
  await page.locator('[data-kanban-board-viewport]').evaluate((element) => {
    element.scrollLeft = 352;
  });
  await expect(requests).toHaveText(/b/);
  await expect(requests).not.toHaveText(/c/);
  await expect(page.getByRole('button', { name: /Load more/i })).toHaveCount(0);
});

test('board fills growing lanes and newly visible columns', async ({
  page,
}) => {
  await page.goto('/board.html', { waitUntil: 'domcontentloaded' });
  const requests = page.getByTestId('requests');
  await expect(requests).toHaveText(/^a(,a)*$/);
  const before = await page.getByTestId('counts').textContent();
  await page.getByRole('button', { name: 'Grow height' }).click();
  await expect(page.getByTestId('counts')).not.toHaveText(before!);
  await expect(requests).not.toHaveText(/[bc]/);
  await page.getByRole('button', { name: 'Grow width' }).click();
  await expect(requests).toHaveText(/b/);
  await expect(requests).not.toHaveText(/c/);
});

test('global search advances visible empty lanes even when loaded matches are offscreen', async ({
  page,
}) => {
  await page.goto('/board.html?global', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('requests')).toHaveText('global,global,global');
  await expect(page.getByTestId('counts')).toHaveText('{"a":10,"b":0,"c":10}');
  await expect(page.getByRole('button', { name: /Load more/i })).toHaveCount(0);
});

test('global search advances when the partial page has no columns', async ({
  page,
}) => {
  await page.goto('/board.html?empty', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('requests')).toHaveText('global,global,global');
  await expect(page.getByTestId('counts')).toHaveText('{"a":10,"b":0,"c":10}');
});

test('retained columns cannot request pages until the new directory is ready', async ({
  page,
}) => {
  await page.goto('/board.html?paused', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('button', { name: 'Resume', exact: true })
  ).toBeVisible();
  await expect(page.getByTestId('requests')).toHaveText('');
  await page.getByRole('button', { name: 'Grow height' }).click();
  await expect(page.getByTestId('requests')).toHaveText('');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByTestId('requests')).toHaveText(/^a(,a)*$/);
});

test('changing filters clears a failed demand and resumes the visible lane', async ({
  page,
}) => {
  await page.goto('/board.html', { waitUntil: 'domcontentloaded' });
  const requests = page.getByTestId('requests');
  await expect(requests).toHaveText(/^a(,a)*$/);
  await page.getByRole('button', { name: 'Fail next' }).click();
  await page.locator('[data-kanban-board-scroll="a"]').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    page.getByRole('button', { name: 'Retry', exact: true })
  ).toBeVisible();
  const before = await requests.textContent();
  await page.getByRole('button', { name: 'Change filters' }).click();
  await expect(
    page.getByRole('button', { name: 'Retry', exact: true })
  ).toHaveCount(0);
  await expect(requests).not.toHaveText(before!);
});

test('a drag-pinned offscreen column stays mounted without fetching more pages', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Mouse dragging is desktop behavior.'
  );
  await page.goto('/board.html', { waitUntil: 'domcontentloaded' });
  const requests = page.getByTestId('requests');
  await expect(requests).toHaveText(/^a(,a)*$/);
  const card = page.locator(
    '[data-kanban-board-column="a"] [data-kanban-card="a:0"]'
  );
  const box = await card.boundingBox();
  if (!box) throw new Error('Expected a visible first task');
  await page.mouse.move(box.x + 4, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(box.x + 24, box.y + 24, {
    steps: 3,
  });
  await expect(page.locator('[data-kanban-preview]')).toBeVisible();
  await page.locator('[data-kanban-board-viewport]').evaluate((element) => {
    element.scrollLeft = 704;
  });
  await expect(requests).toHaveText(/c/);
  const previous = JSON.parse(
    (await page.getByTestId('counts').textContent())!
  ).a;
  const pinned = page.locator(
    '[data-kanban-board-column="a"] [data-kanban-board-scroll="a"]'
  );
  await expect(pinned).toHaveCount(1);
  await pinned.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        element.addEventListener('scroll', () => resolve(), { once: true });
        element.scrollTop = element.scrollHeight;
      })
  );
  await expect(page.getByTestId('counts')).toContainText(`"a":${previous},`);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('[data-kanban-preview]')).toHaveCount(0);
});
