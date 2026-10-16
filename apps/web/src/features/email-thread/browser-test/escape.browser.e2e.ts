import { expect, type Page, test } from '@playwright/test';

// The fixture imports app modules that open sockets and refresh tokens; keep
// every request on the fixture server.
test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (route) =>
    route.abort()
  );
  await page.routeWebSocket(/^wss?:\/\/(?!127\.0\.0\.1[:/])/, (socket) =>
    socket.close()
  );
});

async function openThread(page: Page, search = '') {
  await page.goto(`/${search}`);
  await expect(page.getByRole('heading', { name: 'Invoice' })).toBeVisible();
  await expect(
    page.getByText('Here is the invoice for September.')
  ).toBeVisible();
}

async function openReply(page: Page) {
  await page.keyboard.press('r');
  const editor = page.locator('[contenteditable="true"][role="textbox"]');
  await expect(editor).toBeFocused();
  return editor;
}

const inbox = (page: Page) => page.getByRole('region', { name: 'Inbox' });

const firstPressCases: [string, (page: Page) => Promise<void>][] = [
  [
    'after clicking inside the HTML body',
    (page) => page.getByText('Here is the invoice for September.').click(),
  ],
  [
    'after clicking an inline image',
    (page) => page.getByRole('img', { name: 'Company logo' }).click(),
  ],
  [
    'with a link in the body focused',
    (page) => page.getByRole('link', { name: 'View invoice' }).focus(),
  ],
  [
    'after selecting a message with the arrow keys',
    (page) => page.keyboard.press('ArrowUp'),
  ],
  [
    'from an empty reply',
    async (page) => {
      await openReply(page);
    },
  ],
  [
    'from a new forward with focus in To',
    async (page) => {
      await page.keyboard.press('f');
      await expect(page.getByRole('combobox').first()).toBeFocused();
    },
  ],
];

for (const [name, setup] of firstPressCases) {
  test(`one Escape returns to the list ${name}`, async ({ page }) => {
    await openThread(page);
    await setup(page);
    await page.keyboard.press('Escape');
    await expect(inbox(page)).toBeVisible();
    await expect(page.getByTestId('deleted-drafts')).toBeEmpty();
  });
}

test('one Escape returns to the list from a reply with text and keeps the draft', async ({
  page,
}) => {
  await openThread(page);
  const editor = await openReply(page);
  await editor.pressSequentially('See you Monday');
  await page.keyboard.press('Escape');
  await expect(inbox(page)).toBeVisible();
  await expect(page.getByTestId('saved-drafts')).toContainText(
    'See you Monday'
  );
  await expect(page.getByTestId('deleted-drafts')).toBeEmpty();
});

test('one Escape returns to the list from a saved draft the thread focused on open', async ({
  page,
}) => {
  await openThread(page, '?draft');
  const editor = page.locator('[contenteditable="true"][role="textbox"]');
  await expect(editor).toBeFocused();
  await expect(editor).toContainText('Saved reply');
  await page.keyboard.press('Escape');
  await expect(inbox(page)).toBeVisible();
  await expect(page.getByTestId('deleted-drafts')).toBeEmpty();
});

test('Escape closes the open send-time picker first, then returns to the list', async ({
  page,
}) => {
  await openThread(page);
  const editor = await openReply(page);
  await editor.pressSequentially('Later');
  const trigger = page.getByRole('button', { name: 'Choose send time' });
  await trigger.click();
  const search = page.getByRole('combobox');
  await expect(search).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(inbox(page)).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(inbox(page)).toBeVisible();
});
