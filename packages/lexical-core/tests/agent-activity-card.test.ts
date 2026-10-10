import { describe, expect, it } from 'vitest';
import { isAgentActivityCard } from '../nodes/AgentActivityNode';

describe('isAgentActivityCard', () => {
  it('accepts the cards a session fold gives its rows', () => {
    expect(
      isAgentActivityCard({
        kind: 'item',
        itemType: 'calendar_event',
        itemId: 'event-1',
        fileType: null,
        action: 'created',
        title: null,
      })
    ).toBe(true);
    expect(
      isAgentActivityCard({
        kind: 'item',
        itemType: 'email_thread',
        itemId: 'thread-1',
        action: 'sent',
      })
    ).toBe(true);
    expect(isAgentActivityCard({ kind: 'view', view: { widgets: [] } })).toBe(
      true
    );
  });

  it('accepts what a search found and a database answer to show', () => {
    expect(
      isAgentActivityCard({
        kind: 'sources',
        query: 'lumen pricing',
        total: 3,
        sources: [
          { kind: 'web', url: 'https://lumen.example/blog', title: 'Prices' },
          { kind: 'item', itemType: 'document', itemId: 'doc-1' },
        ],
      })
    ).toBe(true);
    expect(
      isAgentActivityCard({
        kind: 'data',
        sql: 'SELECT 1',
        databaseId: null,
        display: 'bar',
      })
    ).toBe(true);
  });

  it('refuses a source a reader could not safely open', () => {
    expect(
      isAgentActivityCard({
        kind: 'sources',
        total: 1,
        sources: [{ kind: 'web', url: 'javascript:alert(1)' }],
      })
    ).toBe(false);
    expect(isAgentActivityCard({ kind: 'data', sql: '' })).toBe(false);
  });

  it('refuses a card it cannot show', () => {
    expect(isAgentActivityCard(null)).toBe(false);
    expect(isAgentActivityCard({ kind: 'view' })).toBe(false);
    expect(
      isAgentActivityCard({
        kind: 'item',
        itemType: 'spaceship',
        itemId: 'x',
        action: 'created',
      })
    ).toBe(false);
    expect(
      isAgentActivityCard({
        kind: 'item',
        itemType: 'document',
        itemId: '',
        action: 'created',
      })
    ).toBe(false);
    expect(
      isAgentActivityCard({
        kind: 'item',
        itemType: 'document',
        itemId: 'doc-1',
        action: 'launched',
      })
    ).toBe(false);
  });
});
