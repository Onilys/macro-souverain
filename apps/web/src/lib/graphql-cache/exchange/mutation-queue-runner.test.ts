import { SaveEmailDraftDocument } from '@service-storage/graphql/generated/graphql';
import {
  createClient,
  createRequest,
  makeOperation,
  type Operation,
  stringifyDocument,
} from '@urql/core';
import { getOperationAST, parse } from 'graphql';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { filter, makeSubject, mergeMap, pipe } from 'wonka';
import type { CacheHost } from '../host/types';
import {
  type ClaimedMutation,
  type CommitOptimisticWriteResult,
  type EnqueueOptimisticMutationResult,
  INITIAL_CACHE_REVISION,
  parseCacheRevision,
} from '../protocol';
import {
  createMutationQueueRunner,
  type MutationQueueRunner,
  queueAttemptOf,
} from './mutation-queue-runner';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function operation(): Operation {
  return makeOperation(
    'mutation',
    createRequest(parse(stringifyDocument(SaveEmailDraftDocument)), {
      input: { draftId: 'draft', subject: 'Draft' },
    }),
    { url: 'http://test', requestPolicy: 'cache-first' }
  );
}
function enqueue(
  op: Operation,
  generation: string,
  claim = true
): EnqueueOptimisticMutationResult {
  const mutation: ClaimedMutation = {
    transactionId: '1',
    uuid: 'same-attempt',
    query: stringifyDocument(op.query),
    operationName: getOperationAST(op.query)?.name?.value,
    variables: op.variables ?? {},
    leaseGeneration: generation,
    attemptCount: Number(generation),
    serverFailureCount: 0,
    superseded: false,
    requiresConfirmation: false,
  };
  return {
    transactionId: mutation.transactionId,
    revision: parseCacheRevision(generation),
    revisionAdvanced: true,
    changed: [],
    affectedOps: [],
    reset: false,
    upsertKind: { kind: 'inserted' },
    initialClaim: claim
      ? { kind: 'claimed', mutation }
      : { kind: 'not-runnable' },
  };
}
function fixture() {
  const forwarded: Operation[] = [];
  const commit = vi.fn<CacheHost['commitOptimisticWrite']>(
    async () =>
      ({
        kind: 'committed',
        revision: INITIAL_CACHE_REVISION,
        revisionAdvanced: true,
        changed: [],
        affectedOps: [],
        reset: false,
      }) satisfies CommitOptimisticWriteResult
  );
  const host = {
    commitOptimisticWrite: commit,
    currentRevision: async () => INITIAL_CACHE_REVISION,
    claimNextMutation: async () => undefined,
  } as unknown as CacheHost;
  let runner!: MutationQueueRunner;
  runner = createMutationQueueRunner({
    host,
    client: createClient({
      url: 'http://test',
      exchanges: [
        () => (source) =>
          pipe(
            source,
            filter((op) => op.kind === 'mutation'),
            mergeMap((op) => {
              forwarded.push(op);
              return makeSubject<import('@urql/core').OperationResult>().source;
            })
          ),
      ],
    }),
    options: {},
    owner: 'owner',
    forward: (op) => forwarded.push(op),
    writeThrough: (result) =>
      runner.settle(result, queueAttemptOf(result.operation)!),
    cacheDocument: (op) => ({
      query: stringifyDocument(op.query),
      operationName: getOperationAST(op.query)?.name?.value,
      variables: op.variables ?? {},
    }),
    deleteReportedRecords: async () => {},
    replayExplicitEffects: () => undefined,
    revalidate: async () => {},
  });
  return { runner, forwarded, commit, host };
}
it.each([false, true])(
  'ignores an older lease arriving after a newer draft claim, already settled: %s',
  async (settled) => {
    const { runner, forwarded, commit } = fixture();
    await runner.admit(operation(), enqueue(operation(), '3'), runner.epoch());
    const result = {
      operation: forwarded[0],
      data: { saveEmailDraft: { draftId: 'draft', subject: 'Draft' } },
      stale: false,
      hasNext: false,
    };
    if (settled) await runner.settle(result, queueAttemptOf(forwarded[0])!);
    await runner.admit(operation(), enqueue(operation(), '1'), runner.epoch());
    expect(forwarded).toHaveLength(1);
    if (!settled) await runner.settle(result, queueAttemptOf(forwarded[0])!);
    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith(
      '1',
      { owner: 'owner', generation: '3' },
      expect.anything()
    );
  }
);

it('ignores a late unclaimed enqueue acknowledgement without releasing a newer claim', async () => {
  const { runner, forwarded, commit } = fixture();
  await runner.admit(operation(), enqueue(operation(), '4'), runner.epoch());
  await runner.admit(
    operation(),
    enqueue(operation(), '2', false),
    runner.epoch()
  );
  await runner.settle(
    {
      operation: forwarded[0],
      data: { saveEmailDraft: { draftId: 'draft', subject: 'Draft' } },
      stale: false,
      hasNext: false,
    },
    queueAttemptOf(forwarded[0])!
  );
  expect(forwarded).toHaveLength(1);
  expect(commit).toHaveBeenCalledOnce();
});

it('ignores a late claim from an earlier transaction after advancing the head', async () => {
  const { runner, forwarded, commit } = fixture();
  await runner.admit(operation(), enqueue(operation(), '3'), runner.epoch());
  const old = enqueue(operation(), '9');
  old.transactionId = '0';
  if (old.initialClaim.kind === 'claimed')
    old.initialClaim.mutation.transactionId = '0';
  await runner.admit(operation(), old, runner.epoch());
  await runner.settle(
    {
      operation: forwarded[0],
      data: { saveEmailDraft: { draftId: 'draft', subject: 'Draft' } },
      stale: false,
      hasNext: false,
    },
    queueAttemptOf(forwarded[0])!
  );
  expect(forwarded).toHaveLength(1);
  expect(commit).toHaveBeenCalledOnce();
});

it('still routes an older head enqueue after a newer tail acknowledgement', async () => {
  const { runner, forwarded } = fixture();
  const tail = enqueue(operation(), '3', false);
  tail.transactionId = '2';
  await runner.admit(operation(), tail, runner.epoch());
  await runner.admit(operation(), enqueue(operation(), '1'), runner.epoch());
  expect(forwarded).toHaveLength(1);
  expect(getOperationAST(forwarded[0].query)?.name?.value).toBe(
    'SaveEmailDraft'
  );
});

it('clears claim watermarks when storage resets and reuses queue identities', async () => {
  const { runner, forwarded } = fixture();
  await runner.admit(operation(), enqueue(operation(), '3'), runner.epoch());
  runner.resetStorage();
  await runner.admit(operation(), enqueue(operation(), '1'), runner.epoch());
  expect(forwarded).toHaveLength(2);
});

it('preserves a pump claim when its unclaimed enqueue acknowledgement arrives afterward', async () => {
  const { runner, forwarded, commit, host } = fixture();
  const current = enqueue(operation(), '5');
  if (current.initialClaim.kind !== 'claimed') throw new Error('Missing claim');
  const claim = current.initialClaim.mutation;
  vi.spyOn(host, 'claimNextMutation').mockResolvedValueOnce(claim);
  runner.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(forwarded).toHaveLength(1);
  await runner.admit(
    operation(),
    enqueue(operation(), '3', false),
    runner.epoch()
  );
  await runner.settle(
    {
      operation: forwarded[0],
      data: { saveEmailDraft: { draftId: 'draft', subject: 'Draft' } },
      stale: false,
      hasNext: false,
    },
    queueAttemptOf(forwarded[0])!
  );
  expect(commit).toHaveBeenCalledOnce();
  expect(commit).toHaveBeenCalledWith(
    '1',
    { owner: 'owner', generation: '5' },
    expect.anything()
  );
});
