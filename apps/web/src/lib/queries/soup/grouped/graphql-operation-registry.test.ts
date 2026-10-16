import type { GroupedSoupInput } from '@service-storage/graphql/generated/graphql';
import { describe, expect, it } from 'vitest';
import {
  groupedSoupInputKey,
  groupedSoupLogicalViewKey,
  registerGroupedSoupContinuation,
} from './graphql-operation-registry';
import { groupPagesByLogicalView } from './graphql-optimistic';

const initial: GroupedSoupInput = {
  initial: { groupBy: { field: 'ENTITY_TYPE' }, limit: 100 },
};
const start: GroupedSoupInput = {
  startGroup: { groupBy: { field: 'ENTITY_TYPE' }, groupKey: '', limit: 100 },
};
describe('group operation ownership', () => {
  it('retains shared registrations until their last observer leaves', () => {
    const first = registerGroupedSoupContinuation(initial, start, 'one');
    const second = registerGroupedSoupContinuation(initial, start, 'one');
    const key = groupedSoupLogicalViewKey(start);
    expect(key).toBeDefined();
    first();
    first();
    expect(groupedSoupLogicalViewKey(start)).toBe(key);
    second();
    expect(groupedSoupLogicalViewKey(start)).toBeUndefined();
  });
  it('does not combine identical requests across accounts', () => {
    const first = registerGroupedSoupContinuation(initial, start, 'one');
    const second = registerGroupedSoupContinuation(initial, start, 'two');
    expect(groupedSoupLogicalViewKey(start)).toBeUndefined();
    first();
    expect(groupedSoupLogicalViewKey(start)).toContain('two');
    second();
    expect(groupedSoupLogicalViewKey(start)).toBeUndefined();
  });
});

describe('grouped GraphQL operation registry', () => {
  it('groups JSON-equivalent inputs when optional fields are undefined', () => {
    const withUndefined: GroupedSoupInput = {
      initial: {
        groupBy: {
          field: 'PROPERTY',
          propertyDefinitionId: 'status-def',
          entityType: undefined,
        },
        limit: undefined,
      },
    };
    const roundTripped = JSON.parse(
      JSON.stringify(withUndefined)
    ) as GroupedSoupInput;
    const continuation: GroupedSoupInput = {
      continuation: {
        groupBy: {
          field: 'PROPERTY',
          propertyDefinitionId: 'status-def',
        },
        groupKey: 'in-progress',
        cursor: 'undefined-regression-cursor',
      },
    };

    expect(groupedSoupInputKey(withUndefined)).toBe(
      groupedSoupInputKey(roundTripped)
    );

    const unregister = registerGroupedSoupContinuation(
      withUndefined,
      continuation
    );
    const views = groupPagesByLogicalView([
      { input: roundTripped, bins: [] },
      { input: continuation, bins: [] },
    ]);

    expect([...views.values()].map((pages) => pages.length)).toEqual([2]);
    unregister();
  });
});
