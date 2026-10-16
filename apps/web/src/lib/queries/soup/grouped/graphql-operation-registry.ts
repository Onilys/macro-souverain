import type {
  GroupedSoupInput,
  GroupSoupDirectoryQueryVariables,
} from '@service-storage/graphql/generated/graphql';

const continuationToInitial = new Map<string, Map<string, number>>();

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function groupedSoupInputKey(input: unknown): string {
  return canonical(input);
}

/** Associates one loaded continuation page with its initial logical view. */
export function registerGroupedSoupContinuation(
  initial: GroupedSoupInput,
  continuation: GroupedSoupInput,
  userId?: string
): () => void {
  return registerOperation(initial, continuation, userId);
}

/** Binds directory metadata to the same authenticated logical view as its pages. */
export function registerGroupedSoupDirectory(
  initial: GroupedSoupInput,
  directory: GroupSoupDirectoryQueryVariables['input'],
  userId?: string
): () => void {
  return registerOperation(initial, { directory }, userId);
}

function registerOperation(
  initial: GroupedSoupInput,
  operation: unknown,
  userId?: string
): () => void {
  const key = groupedSoupInputKey(operation);
  const view = userId
    ? groupedSoupInputKey([userId, initial])
    : groupedSoupInputKey(initial);
  const views = continuationToInitial.get(key) ?? new Map<string, number>();
  views.set(view, (views.get(view) ?? 0) + 1);
  continuationToInitial.set(key, views);
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    const owners = (views.get(view) ?? 1) - 1;
    if (owners > 0) views.set(view, owners);
    else views.delete(view);
    if (views.size === 0) continuationToInitial.delete(key);
  };
}

/** Returns the initial-view key for an initial or registered continuation. */
export function groupedSoupLogicalViewKey(input: unknown): string | undefined {
  if (input !== null && typeof input === 'object' && 'initial' in input) {
    return groupedSoupInputKey(input);
  }
  const views = continuationToInitial.get(groupedSoupInputKey(input));
  // Identical starts can briefly coexist across users during an account switch.
  // Ambiguous operations fall back to revalidation, never cross-view cache moves.
  return views?.size === 1 ? views.keys().next().value : undefined;
}
