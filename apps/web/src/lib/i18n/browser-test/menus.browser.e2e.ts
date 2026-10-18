import { expect, test } from '@playwright/test';
import { LANGUAGES } from '../languages';

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket('**', (socket) => socket.close());
  await page.route('https://**', (route) => route.abort());
});

for (const { code } of LANGUAGES) {
  test(`menus fit their labels in ${code}`, async ({ page }) => {
    await page.goto(`/src/lib/i18n/browser-test/menus.html?lang=${code}`);
    await expect(page.locator('[data-translation-ready]')).toBeAttached({
      timeout: 30_000,
    });
    await expect(page.getByRole('menuitem').first()).toBeVisible();

    // A label is clipped when its text is wider than the space it is given.
    const clipped = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '[role="menu"] .truncate, [data-surface] .truncate'
        ),
      ]
        .filter((label) => label.scrollWidth > label.clientWidth + 1)
        .map((label) => label.textContent?.trim())
    );
    await page.screenshot({
      path: test.info().outputPath(`menus-${code}.png`),
      fullPage: true,
    });
    expect(clipped).toEqual([]);
  });
}
