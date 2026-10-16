import { expect, type Locator, test } from '@playwright/test';

const activate = (button: Locator, touch: boolean) =>
  touch ? button.tap() : button.click();

test('fills the viewport, fetches groups sequentially, and has one scroller', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('requests')).toHaveText('a,a,a');
  await expect(page.getByTestId('groups')).toHaveText('a');
  const scroller = page.locator('[data-soup-list-container]');
  await expect(scroller).toHaveCount(1);
  for (const expected of ['a,a,a,a', 'a,a,a,a,a', 'a,a,a,a,a,a,b']) {
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(page.getByTestId('requests')).toContainText(expected);
  }
  await expect(page.getByTestId('requests')).toContainText('a,a,a,a,a,a,b');
  await expect(page.getByRole('button', { name: 'Load More' })).toHaveCount(0);
});

test('skips collapsed groups and retains later groups on re-expansion', async ({
  page,
  hasTouch,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('requests')).toHaveText('a,a,a');
  await activate(
    page.getByRole('button', { name: 'Toggle a', exact: true }),
    hasTouch
  );
  await expect(page.getByTestId('requests')).toContainText('b');
  await activate(
    page.getByRole('button', { name: 'Toggle a', exact: true }),
    hasTouch
  );
  await expect(page.getByTestId('groups')).toHaveText('a,b');
});

test('fills a resized viewport and pauses on failure until Retry', async ({
  page,
  hasTouch,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('requests')).toHaveText('a,a,a');
  await activate(page.getByRole('button', { name: 'Fail next' }), hasTouch);
  await activate(page.getByRole('button', { name: 'Grow viewport' }), hasTouch);
  await expect(page.getByTestId('requests')).toHaveText('a,a,a,a');
  const scroller = page.locator('[data-soup-list-container]');
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await activate(page.getByRole('button', { name: 'Retry' }), hasTouch);
  await expect(page.getByTestId('requests')).toContainText('a,a,a,a,a');
});

test('keeps the visible later group anchored when an earlier group is expanded', async ({
  page,
  hasTouch,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('requests')).toHaveText('a,a,a');
  await activate(
    page.getByRole('button', { name: 'Toggle a', exact: true }),
    hasTouch
  );
  await expect(page.getByTestId('requests')).toContainText('b,b,b');
  const scroller = page.locator('[data-soup-list-container]');
  await scroller.evaluate((element) => {
    element.scrollTop = 120;
  });
  await expect(page.getByTestId('scroll-offset')).toHaveText('120');
  const before = await page.locator('[data-row="b:1"]').boundingBox();
  await activate(
    page.getByRole('button', { name: 'Toggle a', exact: true }),
    hasTouch
  );
  // Cached pages finish a above the retained b rows without moving their anchor.
  await expect(page.getByTestId('requests')).toHaveText('a,a,a,b,b,b,a,a,a');
  await expect(page.getByTestId('scroll-offset')).toHaveText('1320');
  expect((await page.locator('[data-row="b:1"]').boundingBox())?.y).toBe(
    before?.y
  );
});
