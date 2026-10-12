/**
 * @vitest-environment jsdom
 */

import type { MessageData } from '@core/messages/types';
import { render } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { messageMentionsViewer } from '../mentioned';
import { Root } from '../Root';

const viewer = 'macro|wolf@macro.com';

function userMention(userId: string, email = 'wolf@macro.com') {
  return `<m-user-mention>${JSON.stringify({
    userId,
    email,
    displayName: 'Wolf',
  })}</m-user-mention>`;
}

function groupMention(groupAlias: string) {
  return `<m-group-mention>${JSON.stringify({ groupAlias })}</m-group-mention>`;
}

const here = groupMention('here');

function message(content: string): MessageData {
  return {
    id: 'message-1',
    content,
    sender_id: 'macro|someone@macro.com',
    created_at: '2026-02-25T00:00:00.000Z',
    updated_at: '2026-02-25T00:00:00.000Z',
    attachments: [],
    reactions: [],
  };
}

describe('messageMentionsViewer', () => {
  it('is golden when the message mentions the viewer', () => {
    expect(messageMentionsViewer(`hey ${userMention(viewer)}`, viewer)).toBe(
      true
    );
  });

  it('matches mention ids case-insensitively', () => {
    expect(
      messageMentionsViewer(userMention('macro|Wolf@Macro.com'), viewer)
    ).toBe(true);
  });

  it('matches the mention email when the id differs', () => {
    expect(
      messageMentionsViewer(userMention('user-1', 'wolf@macro.com'), viewer)
    ).toBe(true);
  });

  it('matches a mention that only carries the viewer email', () => {
    const content = `<m-user-mention>${JSON.stringify({
      email: 'wolf@macro.com',
    })}</m-user-mention>`;
    expect(messageMentionsViewer(content, viewer)).toBe(true);
  });

  it('is golden for @here even without a signed-in viewer', () => {
    expect(messageMentionsViewer(`ping ${here} please`, undefined)).toBe(true);
  });

  it('is golden when @here is mixed with someone else', () => {
    expect(
      messageMentionsViewer(
        `${userMention('macro|teo@macro.com', 'teo@macro.com')} ${here}`,
        viewer
      )
    ).toBe(true);
  });

  it('ignores other people, other groups, and plain @here text', () => {
    expect(
      messageMentionsViewer(
        userMention('macro|teo@macro.com', 'teo@macro.com'),
        viewer
      )
    ).toBe(false);
    expect(messageMentionsViewer(groupMention('team'), viewer)).toBe(false);
    expect(messageMentionsViewer('please @here look', viewer)).toBe(false);
    expect(messageMentionsViewer('hello', undefined)).toBe(false);
  });

  it('ignores malformed mention payloads', () => {
    expect(
      messageMentionsViewer('<m-user-mention>{bad}</m-user-mention>', viewer)
    ).toBe(false);
    expect(
      messageMentionsViewer('<m-group-mention>nope</m-group-mention>', viewer)
    ).toBe(false);
  });
});

describe('Root mention wash', () => {
  it('marks a message that mentions the viewer', () => {
    const { container } = render(() => (
      <Root message={message(userMention(viewer))} viewerId={viewer} />
    ));

    expect(container.querySelector('[data-mentioned]')).not.toBeNull();
  });

  it('marks @here without a signed-in user', () => {
    const { container } = render(() => <Root message={message(here)} />);

    expect(container.querySelector('[data-mentioned]')).not.toBeNull();
  });

  it('leaves other messages unmarked', () => {
    const { container } = render(() => (
      <Root message={message('hello')} viewerId={viewer} />
    ));

    expect(container.querySelector('[data-mentioned]')).toBeNull();
  });
});
