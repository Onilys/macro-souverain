import { cleanup, render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityIcon } from '../extractors/entity-icon';
import type { ChannelEntity, ChannelMessageEntity } from '../types/entity';

const channelPicture = vi.hoisted(() => ({
  url: undefined as string | undefined,
  channelIds: [] as string[],
}));
vi.mock('@queries/channel/picture', () => ({
  useChannelPicture: (channelId: () => string) => {
    channelPicture.channelIds.push(channelId());
    return { url: () => channelPicture.url, revision: () => 1 };
  },
}));
vi.mock('@core/constant/allBlocks', () => ({
  blockAcceptedFileExtensionSet: new Set(),
  fileTypeToBlockName: vi.fn(),
  isBlockAlias: () => false,
  itemToBlockName: vi.fn(),
}));
vi.mock('@core/context/user', () => ({ useUserId: () => () => 'user' }));
vi.mock('@core/component/UserIcon', () => ({
  UserIcon: (props: { id: string }) => (
    <span data-testid="user-avatar" data-user-id={props.id} />
  ),
}));
vi.mock('../components/ChatProviderIcon', () => ({
  ChatProviderIcon: () => null,
}));
vi.mock('@ui', async () => ({
  cn: (await import('@ui/utils/classname')).cn,
}));

afterEach(cleanup);

describe('Entity.Icon', () => {
  beforeEach(() => {
    channelPicture.url = undefined;
    channelPicture.channelIds = [];
  });

  const channel: ChannelEntity = {
    type: 'channel',
    id: 'channel-id',
    name: 'Channel',
    ownerId: 'user',
    channelType: 'private',
  };

  it('renders a channel picture when available', () => {
    channelPicture.url = 'https://example.com/channel.png';
    const { container } = render(() => <EntityIcon entity={channel} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      channelPicture.url
    );
    expect(channelPicture.channelIds).toEqual(['channel-id']);
  });

  it('loads the parent channel picture for a channel message', () => {
    const message: ChannelMessageEntity = {
      ...channel,
      type: 'channel_message',
      id: 'message-id',
      channelId: channel.id,
      channelName: channel.name,
      messageId: 'message-id',
      senderId: 'user',
      content: 'Message',
    };
    render(() => <EntityIcon entity={message} />);
    expect(channelPicture.channelIds).toEqual(['channel-id']);
  });

  it('keeps direct messages on their participant avatar', () => {
    const { container } = render(() => (
      <EntityIcon
        entity={{
          ...channel,
          channelType: 'direct_message',
          participantIds: ['user', 'other-user'],
        }}
      />
    ));
    expect(channelPicture.channelIds).toEqual([]);
    expect(
      container
        .querySelector('[data-testid="user-avatar"]')
        ?.getAttribute('data-user-id')
    ).toBe('other-user');
  });

  it.each(['user', 'other-user'])(
    'does not fetch channel pictures for DM message rows (sender %s)',
    (senderId) => {
      const message: ChannelMessageEntity = {
        type: 'channel_message',
        id: 'message-id',
        name: 'Message',
        ownerId: 'user',
        channelId: 'dm-channel',
        channelName: 'Direct message',
        channelType: 'direct_message',
        messageId: 'message-id',
        senderId,
        content: 'Message',
      };
      render(() => <EntityIcon entity={message} />);
      expect(channelPicture.channelIds).toEqual([]);
    }
  );
});
