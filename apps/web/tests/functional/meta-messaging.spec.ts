import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  expect as baseExpect,
  test,
  type WebSocketRoute,
} from '@playwright/test';
import { buildSchema, graphql } from 'graphql';
import { replyOptions } from '../../src/features/meta-messaging/tests/reply-options';
import type { MessageEvent } from '../../src/lib/service-clients/service-storage/generated/schemas/messageEvent';
import type { MetaConnection } from '../../src/lib/service-clients/service-storage/generated/schemas/metaConnection';
import type { MetaConversationView } from '../../src/lib/service-clients/service-storage/generated/schemas/metaConversationView';
import type { MetaSendProgress } from '../../src/lib/service-clients/service-storage/generated/schemas/metaSendProgress';
import type { MetaSendReply } from '../../src/lib/service-clients/service-storage/generated/schemas/metaSendReply';
import type { SoupInput } from '../../src/lib/service-clients/service-storage/graphql/generated/graphql';
import type {
  MessageListItem,
  MessageTimelineEntry,
} from '../../src/lib/service-clients/service-storage/messages';
import { bootstrapResponses } from '../native/fixtures/bootstrap';
import { USER_ID } from '../native/fixtures/mail';

const expect = baseExpect.configure({ timeout: 30_000 });

// Real bundled app, routing and query/socket adapters; only remote transport is synthetic.
test.use({
  baseURL: `http://127.0.0.1:${Number(process.env.FUNCTIONAL_APP_PORT ?? Number(process.env.FUNCTIONAL_TEST_PORT ?? 4191) + 1)}`,
  viewport: { width: 1440, height: 1000 },
  serviceWorkers: 'block',
});
test('native channels and external messaging preserve composition, recovery, and call policy', async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.setTimeout(600_000);
  const origin = baseURL!;
  await context.addCookies([{ name: 'login', value: 'true', url: origin }]);
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(90000);
  const errors: string[] = [];
  const unknown = new Set<string>();
  page.on('pageerror', (error) => errors.push(error.message));
  const gateways = new Set<WebSocketRoute>();
  await page.routeWebSocket('**/*', (socket) => {
    if (socket.url().includes('/dss/items/soup/graphql/ws')) {
      socket.onMessage((message) => {
        const frame = JSON.parse(String(message)) as { type: string };
        if (frame.type === 'connection_init')
          socket.send(JSON.stringify({ type: 'connection_ack' }));
        if (frame.type === 'ping')
          socket.send(JSON.stringify({ type: 'pong' }));
      });
      return;
    }
    if (!socket.url().includes('/connection-gateway')) return socket.close();
    gateways.add(socket);
    socket.onMessage((message) => {
      if (message === 'ping') socket.send('pong');
    });
    socket.onClose(() => gateways.delete(socket));
  });
  const id = (number: number) =>
    `019a0000-0000-7000-8000-${number.toString().padStart(12, '0')}`;
  const channels = [
    { id: id(101), name: 'Native team conversation', provider: null },
    { id: id(102), name: 'WhatsApp customer', provider: 'whatsapp' },
    { id: id(103), name: 'Instagram customer', provider: 'instagram' },
  ] as const;
  let activeUser = USER_ID;
  let denied = false;
  let bindingError = false;
  let holdBinding = false;
  let unknownSend = false;
  let windowClosed = false;
  let failSend = false;
  let expireSend = false;
  const submissions: MetaSendReply[] = [];
  const sends = new Map<string, MetaSendProgress[]>();
  const seenNotifications = new Set<string>();
  const time = (offset: number) =>
    new Date(Date.now() - 7200000 + offset * 60000).toISOString();
  let showSettings = false;
  const settingsAccount: MetaConnection = {
    id: id(810),
    team_id: id(800),
    user_id: USER_ID,
    provider: 'whatsapp',
    account_id: 'controlled-platform',
    display_name: 'Controlled Platform account',
    status: 'connecting',
    developer_account: false,
    human_agent_approved: false,
    whatsapp_mode: 'platform',
    registration_status: 'required',
    health_error: 'registration_required',
    connected_at: new Date().toISOString(),
  };
  const otherAccount: MetaConnection = {
    ...settingsAccount,
    id: id(811),
    user_id: 'macro|other-connector@example.com',
    account_id: 'other-business',
    display_name: 'Other member’s account',
    status: 'connected',
    whatsapp_mode: 'coexistence',
    registration_status: null,
    health_error: null,
  };
  const registrations: Array<{ pin?: string }> = [];
  function message(
    channel: string,
    number: number,
    content: string,
    external = false
  ): MessageListItem {
    const created_at = time(number % 100);
    const sender_id = external ? `external|${id(900)}` : activeUser;
    return {
      id: id(number),
      parent: { type: 'channel', id: channel },
      sender_id,
      imported_author: external ? { name: 'Test Customer' } : null,
      content,
      created_at,
      updated_at: created_at,
      mentions: [],
      reactions: [],
      attachments: [],
      state: {
        root_id: id(number),
        user_id: sender_id,
        created_at,
        updated_at: created_at,
        resolved: false,
      },
      thread: { reply_count: 0, preview: [] },
    };
  }
  const messages = new Map<string, MessageListItem[]>(
    channels.map((channel, index) => [
      channel.id,
      Array.from({ length: 35 }, (_, number) =>
        message(
          channel.id,
          1000 + index * 100 + number,
          `${channel.name} message ${number + 1}`,
          !!channel.provider
        )
      ),
    ])
  );
  const unreadReply = message(channels[0].id, 9100, 'Unread thread reply');
  unreadReply.thread_id = messages.get(channels[0].id)![3].id;
  unreadReply.sender_id = 'macro|teammate@browser.test';
  unreadReply.created_at = time(4);
  unreadReply.updated_at = unreadReply.created_at;
  messages.get(channels[0].id)![3].thread = {
    reply_count: 1,
    preview: [unreadReply],
  };
  function event(
    value: MessageListItem,
    type: 'posted' | 'edited' | 'message_deleted' = 'posted'
  ) {
    const change: MessageEvent['change'] =
      type === 'posted'
        ? { type, message: value, mentions: [], notification_policy: 'Silent' }
        : type === 'edited'
          ? {
              type,
              message: value,
              mentions: [],
              notification_policy: 'Default',
              previous_attachments: [],
            }
          : { type, message: value };
    const data: MessageEvent = {
      actor: activeUser,
      parent: value.parent,
      change,
    };
    for (const socket of gateways)
      socket.send(JSON.stringify({ type: 'message_update', data }));
  }
  function conversation(channelId: string): MetaConversationView | null {
    const channel = channels.find((channel) => channel.id === channelId)!;
    if (!channel.provider) return null;
    const options = replyOptions(channel.provider);
    if (windowClosed)
      options.eligibility.modes[0] = {
        mode: 'free_form',
        allowed: false,
        reason: 'template_required',
      };
    if (denied)
      for (const mode of options.eligibility.modes) {
        mode.allowed = false;
        mode.reason = 'forbidden';
      }
    return {
      ...options,
      provider: channel.provider,
      account_name: 'Test Business',
      status: 'connected',
      can_reply: !denied,
      // Conversation details must not surface developer-only setup.
      developer_account: true,
      human_agent_approved: false,
      text_limit: options.capabilities.text_limit,
      text_limit_in_bytes: options.capabilities.text_limit_in_bytes,
      media: options.capabilities.media,
      sends: sends.get(channelId) ?? [],
      conversation: {
        channel_id: channelId,
        connection_id: id(500),
        customer_id: 'test-customer',
        customer_display_name: 'Test Customer',
        customer_handle:
          channel.provider === 'instagram' ? 'test.customer' : null,
        customer_phone:
          channel.provider === 'whatsapp' ? '+1 202 555 0147' : null,
        last_customer_message_at: time(35),
      },
    };
  }
  function soupItem(channel: (typeof channels)[number]) {
    const latest = messages.get(channel.id)!.at(-1)!;
    const preview = {
      messageId: latest.id,
      channelId: channel.id,
      threadId: null,
      senderId: latest.sender_id,
      content: latest.content,
      createdAt: latest.created_at,
      updatedAt: latest.updated_at,
      deletedAt: null,
      mentions: [],
    };
    return {
      __typename: 'GraphqlSoupChannel',
      id: channel.id,
      entityType: 'CHANNEL',
      name: channel.name,
      displayName: channel.name,
      channelType: 'private',
      ownerId: activeUser,
      organizationId: null,
      teamId: null,
      createdAt: time(0),
      updatedAt: latest.updated_at,
      viewedAt: null,
      interactedAt: null,
      isParticipant: true,
      participants: [
        {
          channelId: channel.id,
          userId: activeUser,
          role: 'owner',
          joinedAt: time(0),
          leftAt: null,
        },
      ],
      latestMessage: preview,
      latestNonThreadMessage: preview,
      cacheProjection: null,
      isFavorited: false,
      notifications: channel.provider
        ? []
        : [
            {
              id: id(300 + channels.indexOf(channel)),
              entityType: 'CHANNEL',
              entityId: channel.id,
              eventType: 'channel_reply',
              state: seenNotifications.has(id(300 + channels.indexOf(channel)))
                ? 'SEEN'
                : 'UNSEEN',
              sent: true,
              createdAt: messages.get(channel.id)![3].created_at,
              updatedAt: messages.get(channel.id)![3].created_at,
              viewedAt: null,
              senderId: null,
              metadata: {
                __typename: 'GraphqlChannelReplyMetadata',
                messageId: unreadReply.id,
                threadId: messages.get(channel.id)![3].id,
                userId: unreadReply.sender_id,
                threadParentSenderId: activeUser,
                messageContent: 'Unread customer message',
                sender: null,
                senderDisplayName: 'Test Customer',
                channelType: 'PRIVATE',
                channelName: channel.name,
                hasAttachments: false,
                senderProfilePictureUrl: null,
              },
            },
          ],
    };
  }
  const schema = buildSchema(
    readFileSync(resolve('../../static_assets/schema.graphql'), 'utf8')
  );
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const respond = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (url.origin !== origin) return route.abort();
    if (
      ['script', 'stylesheet', 'font', 'image', 'media'].includes(
        request.resourceType()
      ) ||
      /^\/(app|@|src|node_modules|local|assets|fonts)(?:\/|$)/.test(path) ||
      path.startsWith('/__vite') ||
      path.startsWith('/@') ||
      path === '/' ||
      path.endsWith('.wasm')
    )
      return route.fulfill({ response: await route.fetch() });
    if (path === '/auth/team' && showSettings)
      return respond({
        team: {
          id: id(800),
          name: 'Controlled team',
          owner_id: 'macro|other-connector@example.com',
          default_link_share: 'off',
        },
        members: [
          { user_id: USER_ID, role: 'member' },
          { user_id: 'macro|other-connector@example.com', role: 'owner' },
        ],
      });
    if (path === '/dss/meta/configuration')
      return respond({
        instagram_human_agent_approved: false,
        whatsapp_developer_available: false,
        whatsapp_app_id: 'controlled-app',
        whatsapp_configuration_id: 'coexistence-config',
        whatsapp_platform_configuration_id: 'platform-config',
        instagram_app_id: null,
        instagram_redirect_uri: null,
        graph_version: 'v26.0',
      });
    if (path === '/dss/meta/connections')
      return respond([settingsAccount, otherAccount]);
    if (path === `/dss/meta/connections/${settingsAccount.id}/history`)
      return respond({
        can_import: false,
        reason:
          'Platform numbers have no WhatsApp Business-app history to import.',
        import: null,
      });
    if (path === `/dss/meta/connections/${settingsAccount.id}/register`) {
      const input = request.postDataJSON() as { pin?: string };
      registrations.push(input);
      settingsAccount.registration_status = input.pin
        ? 'unconfirmed'
        : 'registered';
      settingsAccount.status = input.pin ? 'connecting' : 'connected';
      settingsAccount.health_error = input.pin
        ? 'registration_unconfirmed'
        : null;
      // The server retains uncertainty even if the first registration response is lost.
      if (input.pin) return route.abort('failed');
      return respond(settingsAccount);
    }
    if (path === '/auth/jwt/refresh') return respond({});
    if (path === '/dss/history') return respond({ data: [] });
    if (path === '/notification/user_notifications')
      return respond({ items: [], next_cursor: null });
    if (path === '/calendar/calendars') return respond({ calendars: [] });
    if (path === '/email/email/backfill/gmail') return respond({ jobs: [] });
    if (path === '/dss/forms/accessible') return respond([]);
    if (path === '/dss/favorites') return respond({ favorites: [] });
    if (path === '/dss/calendar-events')
      return respond({ items: [], next_cursor: null });
    if (path === '/dss/items/soup/graphql') {
      const body = request.postDataJSON() as {
        query: string;
        variables?: Record<string, unknown>;
        operationName?: string;
      };
      const result = await graphql({
        schema,
        source: body.query,
        variableValues: body.variables,
        operationName: body.operationName,
        rootValue: {
          updateNotifications: ({
            input,
          }: {
            input: { notificationIds: string[] };
          }) => {
            const updated = channels
              .flatMap((channel) => soupItem(channel).notifications)
              .filter((notification) =>
                input.notificationIds.includes(notification.id)
              );
            for (const notification of updated) {
              seenNotifications.add(notification.id);
              notification.state = 'SEEN';
            }
            return updated;
          },
          recordChannelActivity: ({
            input,
          }: {
            input: { channelId: string };
          }) => ({
            id: id(880),
            userId: activeUser,
            channelId: input.channelId,
            createdAt: time(0),
            updatedAt: new Date().toISOString(),
            viewedAt: new Date().toISOString(),
            interactedAt: null,
          }),
          user: {
            id: activeUser,
            emailLinks: [],
            emailLabels: [],
            favorites: [],
            soup: ({ input }: { input: SoupInput }) => {
              const channelId =
                input.initial?.filters?.channelFilter?.literal?.channelId;
              return {
                items:
                  body.operationName === 'ChannelListSoup'
                    ? channels.map(soupItem)
                    : channelId
                      ? channels
                          .filter((channel) => channel.id === channelId)
                          .map((channel) => ({
                            ...soupItem(channel),
                            notifications: soupItem(
                              channel
                            ).notifications.filter(
                              (notification) => notification.state === 'UNSEEN'
                            ),
                          }))
                      : [],
                nextCursor: null,
              };
            },
          },
        },
      });
      if (result.errors)
        errors.push(...result.errors.map((error) => error.message));
      return respond(result);
    }
    const meta = path.match(
      /^\/dss\/meta\/channels\/([^/]+)(?:\/(replies|delivery|templates))?$/
    );
    if (meta) {
      const channel = meta[1];
      if (!meta[2]) {
        if (holdBinding) return;
        return bindingError
          ? respond({}, 503)
          : respond({ messaging: conversation(channel) });
      }
      if (meta[2] === 'delivery') return respond(sends.get(channel) ?? []);
      if (meta[2] === 'templates')
        return respond([
          {
            id: 'approved-template',
            name: 'order_update',
            language: 'en_US',
            components: [
              { type: 'BODY', text: 'Hello {{1}}, your order is ready.' },
            ],
            parameter_labels: ['body 1'],
          },
        ]);
      const payload = request.postDataJSON() as MetaSendReply;
      if (denied) return respond({}, 403);
      submissions.push(payload);
      const attempt: MetaSendProgress = {
        id: id(5000 + submissions.length),
        channel_id: channel,
        user_id: activeUser,
        created_at: new Date(
          Date.now() - (expireSend ? 600001 : 0)
        ).toISOString(),
        state: unknownSend
          ? 'unknown'
          : failSend || expireSend
            ? 'failed'
            : 'pending',
        error_code: expireSend
          ? 'send_expired'
          : failSend
            ? 'provider_rejected'
            : null,
        payload,
      };
      sends.set(channel, [...(sends.get(channel) ?? []), attempt]);
      if (!unknownSend && !failSend && !expireSend)
        setTimeout(() => {
          const native = message(
            channel,
            6000 + submissions.length,
            payload.message.type === 'text'
              ? payload.message.text
              : 'Attachment'
          );
          native.created_at = attempt.created_at;
          native.updated_at = attempt.created_at;
          native.imported_author = { name: 'Test Business' };
          messages.get(channel)!.push(native);
          attempt.state = 'accepted';
          attempt.message_id = native.id;
          event(native);
        }, 1200);
      return respond(attempt);
    }
    const timeline = path.match(
      /^\/dss\/messages\/channel\/([^/]+)\/timeline$/
    );
    if (timeline) {
      const entries: MessageTimelineEntry[] = messages
        .get(timeline[1])!
        .map((message) => ({ type: 'message', message }));
      entries.push({
        type: 'activity',
        activity: {
          id: id(700),
          actor_id: activeUser,
          occurred_at: time(33),
          action: 'renamed',
          payload: { to: 'Conversation ready' },
        },
      });
      return respond({
        entries: entries.sort((a, b) =>
          (b.type === 'message'
            ? b.message.created_at
            : b.activity.occurred_at
          ).localeCompare(
            a.type === 'message' ? a.message.created_at : a.activity.occurred_at
          )
        ),
        next_cursor: null,
        previous_cursor: null,
      });
    }
    const item = path.match(
      /^\/dss\/messages\/channel\/([^/]+)\/items\/([^/]+)$/
    );
    if (item) {
      const value = [...messages.get(item[1])!, unreadReply].find(
        (message) => message.id === item[2]
      );
      return value ? respond(value) : respond({}, 404);
    }
    const thread = path.match(
      /^\/dss\/messages\/channel\/([^/]+)\/threads\/([^/]+)$/
    );
    if (thread) {
      const root = messages
        .get(thread[1])!
        .find((message) => message.id === thread[2]);
      return root
        ? respond({ root, state: root.state, replies: root.thread.preview })
        : respond({}, 404);
    }
    if (/^\/dss\/call\/[^/]+\/active$/.test(path)) return respond(null);
    if (path === '/dss/channels/preview') return respond({ previews: [] });
    const parent = path.match(/^\/dss\/messages\/channel\/([^/]+)$/);
    if (parent && request.method() === 'GET') {
      const selection = JSON.parse(
        url.searchParams.get('selection') ?? '{}'
      ) as {
        ids?: string[];
      };
      const items = messages
        .get(parent[1])!
        .filter(
          (message) => !selection.ids || selection.ids.includes(message.id)
        );
      return respond({
        items: [...items].reverse(),
        next_cursor: null,
        previous_cursor: null,
      });
    }
    if (parent && request.method() === 'POST') {
      const input = request.postDataJSON() as {
        content: string;
        id?: string;
        thread_id?: string;
      };
      const value = message(
        parent[1],
        8000 + messages.get(parent[1])!.length,
        input.content
      );
      value.id = input.id ?? value.id;
      value.state.root_id = value.id;
      value.thread_id = input.thread_id ?? null;
      value.created_at = new Date().toISOString();
      value.updated_at = value.created_at;
      if (input.thread_id) {
        const root = messages
          .get(parent[1])!
          .find((message) => message.id === input.thread_id)!;
        root.thread.preview.push(value);
        root.thread.reply_count++;
      } else messages.get(parent[1])!.push(value);
      setTimeout(() => event(value), 100);
      return respond(value);
    }
    if (/^\/dss\/messages\/channel\/[^/]+\/typing$/.test(path))
      return respond({});
    const participants = path.match(/^\/dss\/channels\/([^/]+)\/participants$/);
    if (participants)
      return respond([
        {
          channel_id: participants[1],
          user_id: activeUser,
          role: 'owner',
          joined_at: time(0),
          left_at: null,
        },
      ]);
    if (/^\/dss\/channels\/[^/]+\/bots$/.test(path)) return respond([]);
    if (path === '/auth/user/get_names_with_email')
      return respond({
        names: [{ id: activeUser, first_name: 'Browser', last_name: 'Tester' }],
      });
    const fixture = bootstrapResponses.get(`${request.method()} ${path}`);
    if (fixture)
      return respond(
        JSON.parse(
          JSON.stringify(fixture.body).replaceAll(USER_ID, activeUser)
        ),
        fixture.status
      );
    unknown.add(`${request.method()} ${path}`);
    return respond({}, 404);
  });

  async function open(channel: string) {
    await page.goto(`${origin}/app/channel/${channel}`, {
      waitUntil: 'commit',
    });
    await expect(page.locator('[data-channel-message-list]')).toBeVisible({
      timeout: 90000,
    });
  }
  async function expectNoCustomerCalls() {
    await expect(
      page.locator(
        '[data-header-action][aria-label="Call"], [data-header-action][aria-label="Join"]'
      )
    ).toHaveCount(0);
    await expect(page.getByText('Calls', { exact: true })).toHaveCount(0);
    await expect(
      page.getByText('A call is active in this channel', { exact: true })
    ).toHaveCount(0);
  }
  const input = page.getByRole('textbox', {
    name: 'External customer reply',
  });
  const sendButton = page.getByRole('button', {
    name: 'Send reply via WhatsApp',
  });
  const picker = page.getByRole('button', {
    name: 'Approved WhatsApp template',
  });
  try {
    await test.step('ordinary channels and unread navigation', async () => {
      await open(channels[0].id);
      await expect(
        page.locator('[data-header-action][aria-label="Call"]')
      ).toBeVisible();
      await expect(page.getByText('Calls', { exact: true })).toBeVisible();
      await expect(
        page.getByText('Conversation ready', { exact: false })
      ).toBeVisible();
      const nativeInput = page
        .locator(
          `[data-input-id="channel-input-${channels[0].id}"] [contenteditable="true"]`
        )
        .first();
      await expect(nativeInput).toBeVisible();
      await page
        .getByRole('button', { name: /unread notification.*above/ })
        .click();
      await expect(
        page.locator(`[data-message-id="${unreadReply.id}"]`)
      ).toBeInViewport();
      await nativeInput.fill('Native browser reply');
      await page
        .locator(
          `[data-input-id="channel-input-${channels[0].id}"] [data-input-action="send"]`
        )
        .click();
      await page
        .locator('[data-channel-scroll]')
        .evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
      await expect(
        page
          .locator('[data-channel-message-list]')
          .getByText('Native browser reply', { exact: true })
      ).toHaveCount(1);
    });
    await test.step('external replies and native row reconciliation', async () => {
      await open(`${channels[1].id}?join_call=true&open_call_tab=true`);
      await expectNoCustomerCalls();
      await expect(
        page.locator(
          '[data-input-id^="channel-input-"] [contenteditable="true"]'
        )
      ).toHaveCount(0);
      await input.fill('External browser reply');
      await page
        .getByRole('button', { name: 'Send reply via WhatsApp' })
        .click();
      await expect(
        page
          .locator('[data-channel-message-list]')
          .getByText('External browser reply', { exact: true })
      ).toHaveCount(1);
      await expect
        .poll(() => sends.get(channels[1].id)?.[0]?.state)
        .toBe('accepted');
      await expect(
        page.locator(
          `[data-message-id="${sends.get(channels[1].id)![0].message_id}"]`
        )
      ).toBeVisible();
      await expect(
        page
          .locator('[data-channel-message-list]')
          .getByText('External browser reply', { exact: true })
      ).toHaveCount(1);
    });
    await test.step('draft isolation and provider revisions', async () => {
      await input.fill('Saved WhatsApp draft');
      await open(channels[2].id);
      await expect(input).toHaveValue('');
      await page
        .getByRole('button', { name: 'Instagram conversation details' })
        .click();
      await expect(
        page.getByText('@test.customer', { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText('Test Customer', { exact: true }).last()
      ).toBeVisible();
      await page.keyboard.press('Escape');
      const revised = messages.get(channels[2].id)!.at(-1)!;
      revised.content = 'Edited customer message';
      revised.edited_at = new Date().toISOString();
      event(revised, 'edited');
      await expect(
        page.locator(`[data-message-id="${revised.id}"]`)
      ).toContainText('Edited customer message');
      revised.content = '';
      revised.deleted_at = new Date().toISOString();
      event(revised, 'message_deleted');
      messages.set(
        channels[2].id,
        messages
          .get(channels[2].id)!
          .filter((message) => message.id !== revised.id)
      );
      await expect(
        page.locator(`[data-message-id="${revised.id}"]`)
      ).toHaveCount(0);
      await input.fill('Saved Instagram draft');
      await open(channels[1].id);
      await expect(input).toHaveValue('Saved WhatsApp draft');
      await page.reload({ waitUntil: 'commit' });
      await expect(input).toHaveValue('Saved WhatsApp draft');
      activeUser = 'macro|second-browser-user@example.com';
      await page.reload({ waitUntil: 'commit' });
      await expect(input).toHaveValue('');
      await input.fill('Second user draft');
      activeUser = USER_ID;
      await page.reload({ waitUntil: 'commit' });
      await expect(input).toHaveValue('Saved WhatsApp draft');
    });
    await test.step('binding failures and send permissions', async () => {
      holdBinding = true;
      await page.reload({ waitUntil: 'commit' });
      await expect(
        page.getByLabel('Loading conversation', { exact: true })
      ).toBeVisible();
      await expect(input).toHaveCount(0);
      await expectNoCustomerCalls();
      holdBinding = false;
      bindingError = true;
      await page.reload({ waitUntil: 'commit' });
      await expect(
        page.getByText('Conversation unavailable.', { exact: false })
      ).toBeVisible();
      await expect(input).toHaveCount(0);
      await expectNoCustomerCalls();
      bindingError = false;
      denied = true;
      await page.reload({ waitUntil: 'commit' });
      await expect(input).toHaveValue('Saved WhatsApp draft');
      await expect(
        page.getByRole('button', { name: 'Send reply via WhatsApp' })
      ).toBeDisabled();
      denied = false;
      await page.reload({ waitUntil: 'commit' });
    });
    await test.step('uncertain send recovery', async () => {
      await input.fill('Uncertain browser reply');
      unknownSend = true;
      await page
        .getByRole('button', { name: 'Send reply via WhatsApp' })
        .click();
      await page
        .getByRole('button', { name: 'Review reply', exact: true })
        .click();
      await expect(page.getByRole('checkbox')).not.toBeChecked();
      await expect(
        page.getByRole('button', { name: 'Send reply via WhatsApp' })
      ).toBeDisabled();
      await page
        .getByText(/I checked WhatsApp and want to send this again/)
        .click();
      await expect(
        page.getByRole('button', { name: 'Send reply via WhatsApp' })
      ).toBeEnabled();
      await page.reload({ waitUntil: 'commit' });
      await expect(page.getByRole('checkbox')).not.toBeChecked();
      unknownSend = false;
    });
    await test.step('template visibility and draft recovery', async () => {
      // Templates stay out of normal replies and appear only when required.
      activeUser = 'macro|template-browser-user@example.com';
      await page.reload({ waitUntil: 'commit' });
      await expect(input).toHaveValue('');
      await expect(page.getByRole('combobox')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /template/i })).toHaveCount(
        0
      );
      await expect(page.getByText(/template/i)).toHaveCount(0);
      await page
        .getByRole('button', { name: 'WhatsApp conversation details' })
        .click();
      await expect(page.getByText('WhatsApp messages sent from')).toBeVisible();
      await expect(
        page.getByText('+1 202 555 0147', { exact: true })
      ).toBeVisible();
      await expect(page.getByText(/test account/i)).toHaveCount(0);
      await page.keyboard.press('Escape');
      await page.screenshot({
        path: testInfo.outputPath('macro-messaging-browser-normal.png'),
      });

      windowClosed = true;
      await page.reload({ waitUntil: 'commit' });
      await input.fill('Typed before the window closed');
      await expect(sendButton).toBeDisabled();
      await expect(page.getByRole('combobox')).toHaveCount(0);
      await expect(page.getByText('The reply window is closed.')).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath('macro-messaging-browser-closed.png'),
      });
      await page.getByRole('button', { name: 'Choose template' }).click();
      await picker.click();
      await page.getByRole('option', { name: 'order_update' }).click();
      await page.getByLabel('body 1').fill('Avery');
      await page.reload({ waitUntil: 'commit' });
      await expect(picker).toContainText('order_update');
      await expect(page.getByLabel('body 1')).toHaveValue('Avery');
      await page.screenshot({
        path: testInfo.outputPath('macro-messaging-browser-template.png'),
      });
      await page.getByRole('button', { name: 'Back to text reply' }).click();
      await expect(input).toHaveValue('Typed before the window closed');
      await page.getByRole('button', { name: 'Choose template' }).click();
      await expect(picker).toContainText('order_update');
      failSend = true;
      await sendButton.click();
      await expect(input).toHaveValue('Typed before the window closed');
      assert.deepEqual(submissions.at(-1)?.message, {
        type: 'template',
        template_id: 'approved-template',
        language: 'en_US',
        parameters: ['Avery'],
      });
      failSend = false;
      await input.fill('');
      await page.getByRole('button', { name: 'Edit and retry' }).last().click();
      await expect(picker).toContainText('order_update');
      await expect(page.getByLabel('body 1')).toHaveValue('Avery');
      await expect(sendButton).toBeEnabled();
      windowClosed = false;
      await page.reload({ waitUntil: 'commit' });
      await expect(picker).toContainText('order_update');
      await page.getByRole('button', { name: 'Back to text reply' }).click();
      await expect(page.getByRole('combobox')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /template/i })).toHaveCount(
        0
      );
    });
    await test.step('expired intent recovery', async () => {
      activeUser = 'macro|expiry-browser-user@example.com';
      await page.reload({ waitUntil: 'commit' });
      await expect(input).toHaveValue('');
      await input.fill('Expired reply kept for editing');
      expireSend = true;
      await sendButton.click();
      const expiredIntent = submissions.at(-1)!;
      const expiredId = sends.get(channels[1].id)!.at(-1)!.id;
      const expiredRow = page.locator(`[data-external-send-id="${expiredId}"]`);
      await expect(
        expiredRow.getByRole('status', { name: 'Not sent', exact: true })
      ).toBeVisible();
      await expiredRow.getByRole('button', { name: 'Edit and retry' }).click();
      await expect(input).toHaveValue('Expired reply kept for editing');
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      expireSend = false;
      await sendButton.click();
      assert.notEqual(
        submissions.at(-1)!.idempotency_key,
        expiredIntent.idempotency_key
      );
      await expectNoCustomerCalls();
      activeUser = USER_ID;
      await page.screenshot({
        path: testInfo.outputPath('macro-messaging-browser.png'),
        fullPage: true,
      });
    });
    await test.step('member settings and registration recovery', async () => {
      showSettings = true;
      await page.goto(`${origin}/app/settings/connections`, {
        waitUntil: 'commit',
      });
      const manage = page.getByRole('button', {
        name: 'Manage WhatsApp Business',
        exact: true,
      });
      await expect(manage).toBeEnabled();
      await manage.click();
      await expect(
        page.getByRole('button', {
          name: 'Connect Platform number',
          exact: true,
        })
      ).toBeVisible();
      const mine = page.locator(
        `[data-messaging-account="${settingsAccount.id}"]`
      );
      const other = page.locator(
        `[data-messaging-account="${otherAccount.id}"]`
      );
      await expect(
        mine.getByText('Connected by', { exact: false })
      ).toBeVisible();
      await expect(
        other.getByRole('button', { name: 'More', exact: true })
      ).toHaveCount(0);
      const pin = mine.getByLabel('WhatsApp two-step verification PIN');
      await pin.fill('123456');
      await mine
        .getByRole('button', { name: 'Register number', exact: true })
        .click();
      await expect(
        mine.getByRole('button', { name: 'Check registration', exact: true })
      ).toBeVisible();
      assert.equal(registrations[0]?.pin, '123456');
      assert.equal(
        await page.evaluate(() =>
          Object.values(localStorage).some((value) =>
            String(value).includes('123456')
          )
        ),
        false
      );
      await mine
        .getByRole('button', { name: 'Check registration', exact: true })
        .click();
      await expect(mine.getByText('Connected', { exact: true })).toBeVisible();
      assert.equal(registrations[1]?.pin, undefined);
      await mine.getByRole('button', { name: 'More', exact: true }).click();
      await page
        .getByRole('menuitem', { name: 'Disconnect', exact: true })
        .click();
      await expect(
        page.getByText('Disconnect Controlled Platform account?', {
          exact: true,
        })
      ).toBeVisible();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    });
    await test.step('mobile controls and composition', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      // Switch the same isolated Chromium context to touch for the mobile stage.
      const touch = await context.newCDPSession(page);
      await touch.send('Emulation.setTouchEmulationEnabled', {
        enabled: true,
        maxTouchPoints: 1,
      });
      // Changing the shell to touch closes desktop overlays; open Settings in the mobile shell.
      await page.goto(`${origin}/app/settings/connections`, {
        waitUntil: 'commit',
      });
      await page
        .getByRole('button', { name: 'Manage WhatsApp Business', exact: true })
        .click();
      await expect(
        page.getByText('Controlled Platform account', { exact: true })
      ).toBeInViewport({ ratio: 1 });
      await expect(
        page.getByRole('button', {
          name: 'Connect Platform number',
          exact: true,
        })
      ).toBeInViewport({ ratio: 1 });
      await page.screenshot({
        path: testInfo.outputPath('settings-mobile.png'),
        animations: 'disabled',
        fullPage: true,
      });
      await page.keyboard.press('Escape');
      await open(channels[1].id);
      const provider = page.getByRole('button', {
        name: 'WhatsApp conversation details',
      });
      const box = await provider.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44);
      await provider.click();
      await expect(page.getByText('WhatsApp messages sent from')).toBeVisible();
      await page.keyboard.press('Escape');
      await input.fill('Mobile layout controlled draft');
      await page.screenshot({
        path: testInfo.outputPath('composer-mobile.png'),
        fullPage: true,
      });
    });
    assert.deepEqual(errors, []);
    assert.deepEqual([...unknown], []);
  } catch (error) {
    console.log('Scenario failure:', error);
    await page
      .screenshot({
        path: testInfo.outputPath('macro-messaging-browser-failure.png'),
        fullPage: true,
        timeout: 3000,
      })
      .catch(() => {});
    console.log((await page.locator('body').innerText()).slice(0, 5000));

    throw error;
  }
});
