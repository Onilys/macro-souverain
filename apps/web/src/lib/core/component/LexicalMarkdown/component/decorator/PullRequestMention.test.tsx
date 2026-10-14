import type { ForeignEntity } from '@service-storage/generated/schemas';
import { render, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@components/app/split-layout/layout', () => ({
  useSplitLayout: () => ({ openWithSplit: vi.fn() }),
}));
vi.mock('@queries/storage/pr-mention', () => ({
  usePrMentionQuery: () => idQuery,
  usePullRequestByGithubKeyQuery: () => githubKeyQuery,
}));
vi.mock('@core/component/HoverCard', () => ({
  HoverCard: (props: { trigger: import('solid-js').JSX.Element }) =>
    props.trigger,
}));
vi.mock('../../plugins', () => ({ autoRegister: vi.fn() }));

import { PullRequestMention } from './PullRequestMention';

const title = 'feat(text-paste): smart paste for GitHub pull request URLs';
const url = 'https://github.com/macro-inc/macro/pull/7956';
const pullRequest: ForeignEntity = {
  id: 'pr-1',
  foreignEntityId: 'macro-inc/macro/pull/7956',
  foreignEntitySource: 'github_pull_request',
  metadata: {
    name: title,
    owner: 'macro-inc',
    repo: 'macro',
    number: 7956,
    url,
    status: 'merged',
  },
  createdAt: '',
  updatedAt: '',
  storedForAuthEntity: '',
  storedForId: '',
};

const [resolved, setResolved] = createSignal<ForeignEntity>();
// Reading a pending solid-query `data` suspends the caller, so it throws here.
const idQuery = {
  get isSuccess() {
    return resolved() !== undefined;
  },
  get data() {
    const entity = resolved();
    if (!entity) throw new Error('unguarded resource read');
    return entity;
  },
};
const githubKeyQuery = {
  get isSuccess() {
    return resolved() !== undefined;
  },
  get data() {
    return resolved() ?? null;
  },
};

beforeEach(() => {
  setResolved(undefined);
});

describe('pull request mention face', () => {
  it('shows a stored label exactly as the resolved PR before its lookup settles', () => {
    const view = render(() => (
      <PullRequestMention
        id={pullRequest.id}
        label={`macro-inc/macro#7956 ${title}`}
        key="node"
        theme={{}}
      />
    ));
    const name = screen.getByText(title);
    const before = view.container.textContent;
    expect(before).toBe(`${title} #7956`);

    setResolved(pullRequest);

    expect(view.container.textContent).toBe(before);
    expect(screen.getByText(title)).toBe(name);
  });

  it('truncates only the title so a long one never wraps or hides the number', () => {
    setResolved(pullRequest);
    render(() => (
      <PullRequestMention id={pullRequest.id} key="node" theme={{}} />
    ));
    const name = screen.getByText(title);
    expect(name.classList.contains('truncate')).toBe(true);
    expect(name.closest('[data-pr-mention]')?.textContent).toContain('#7956');
    expect(name.textContent).not.toContain('#7956');
  });

  it('reserves the title width for an agent-written URL mention until and after it resolves', () => {
    const view = render(() => (
      <>
        <PullRequestMention id="" url={url} label="" key="agent" theme={{}} />
        <PullRequestMention
          id={pullRequest.id}
          label={`macro-inc/macro#7956 ${title}`}
          key="composed"
          theme={{}}
        />
      </>
    ));
    const [agentWritten, composed] =
      view.container.querySelectorAll('[data-pr-mention]');
    expect(agentWritten.textContent).toBe('macro-inc/macro#7956');
    expect(agentWritten.classList.contains('w-[32em]')).toBe(true);
    expect(composed.classList.contains('w-[32em]')).toBe(false);

    setResolved(pullRequest);

    expect(agentWritten.textContent).toBe(`${title} #7956`);
    expect(agentWritten.classList.contains('w-[32em]')).toBe(true);
  });
});
