import type { ImportEntity } from '@queries/import';
import { describe, expect, it } from 'vitest';
import { decodeImportDraft, decodePlanEntries } from './import-plan';

const row: ImportEntity = {
  id: 'roadmap',
  user_id: 'owner',
  source: 'notion',
  kind: 'data_source',
  foreign_id: 'notion-roadmap',
  parent_id: 'wiki',
  review_id: 'review',
  status: 'staged',
  initiator: 'chat',
  metadata: {
    title: 'Roadmap',
    url: 'https://notion.so/roadmap',
    plan: {
      decision: 'tasks',
      reason: 'Rows have a status',
      path: ['Wiki'],
      rows: 40,
      taskFields: { status: 'Status' },
    },
  },
  last_error: 'Rate limited',
  created_at: '2026-10-19T00:00:00Z',
  updated_at: '2026-10-19T00:00:00Z',
};

describe('decodePlanEntries', () => {
  it("keeps this review's Notion plan rows", () => {
    expect(
      decodePlanEntries(
        [
          row,
          { ...row, id: 'older', review_id: 'older-review' },
          { ...row, id: 'single', metadata: { title: 'Staged alone' } },
          { ...row, id: 'slack', source: 'slack' },
        ],
        'review'
      )
    ).toEqual([
      {
        id: 'roadmap',
        parentId: 'wiki',
        kind: 'database',
        title: 'Roadmap',
        decision: 'tasks',
        reason: 'Rows have a status',
        rows: 40,
        status: 'staged',
        error: 'Rate limited',
      },
    ]);
  });
});

describe('decodeImportDraft', () => {
  it('reads the excluded rows and rejects other drafts', () => {
    expect(decodeImportDraft({ source: 'notion' })).toEqual({
      source: 'notion',
      excluded: [],
    });
    expect(
      decodeImportDraft({ source: 'notion', excluded: ['roadmap'] })
    ).toEqual({ source: 'notion', excluded: ['roadmap'] });
    expect(decodeImportDraft({ subject: 'Hi' })).toBeUndefined();
  });
});
