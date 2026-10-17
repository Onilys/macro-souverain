/**
 * @vitest-environment jsdom
 */

import { useAgentModelsQuery } from '@queries/agents/models';
import type { LoadAgentModelsResponse } from '@service-agent-harness/generated/schemas';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@solidjs/testing-library';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/solid-query';
import { Suspense } from 'solid-js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Harness } from './Harness';
import { chooseSelectOption } from './tests/select-helpers';

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastFailure: vi.fn(),
  models: {
    data: {
      status: 'available' as const,
      currentModel: 'default-model',
      models: [{ id: 'default-model', name: 'Default Model' }],
    },
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  },
}));

const harnessMocks = vi.hoisted(() => ({
  query: {
    isSuccess: true,
    isPending: false,
    data: [] as unknown[],
    isError: false,
  },
  deleteHarness: vi.fn(),
  approve: vi.fn(),
  pairing: {
    data: {
      code: 'KX7M-4QHD',
      requested_name: 'Dev laptop',
      requested_scope: null,
      host: 'erics-mbp.local',
      created_at: '2026-08-27T12:00:00Z',
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    },
    isError: false,
  },
}));

vi.mock('@queries/agents/models', () => ({
  useAgentModelsQuery: vi.fn(() => mocks.models),
}));

vi.mock('@queries/harnesses/harnesses', () => ({
  useHarnessesQuery: () => harnessMocks.query,
  useDeleteHarnessMutation: () => ({
    mutateAsync: harnessMocks.deleteHarness,
    isPending: false,
  }),
  useHarnessPairingQuery: (code: () => string | undefined) => ({
    get data() {
      return code() && !harnessMocks.pairing.isError
        ? harnessMocks.pairing.data
        : undefined;
    },
    get isError() {
      return Boolean(code()) && harnessMocks.pairing.isError;
    },
    get isSuccess() {
      return Boolean(code()) && !harnessMocks.pairing.isError;
    },
    get error() {
      return harnessMocks.pairing.isError ? new Error('gone') : null;
    },
  }),
  useApproveHarnessPairingMutation: () => ({
    mutateAsync: harnessMocks.approve,
    isPending: false,
  }),
  invalidateHarnesses: vi.fn(),
}));

vi.mock('@queries/team/teams', () => ({
  useCurrentTeamQuery: () => ({ data: { team: { id: 'team-1' } } }),
}));

vi.mock('@core/component/Toast/Toast', () => ({
  toast: {
    success: mocks.toastSuccess,
    failure: mocks.toastFailure,
  },
}));

const REGISTERED_HARNESS = {
  id: '3f1c9d2e-8a4b-4c5d-9e6f-1a2b3c4d5e6f',
  kind: 'macrod',
  name: 'Dev box',
  owner: { type: 'team', team_id: 'team-1' },
  created_by: 'macro|user@example.com',
  created_at: '2026-08-27T12:00:00Z',
  updated_at: '2026-08-27T12:00:00Z',
  connected: true,
  last_connected_at: '2026-08-27T12:34:00Z',
};

beforeAll(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.models.data = {
    status: 'available',
    currentModel: 'default-model',
    models: [{ id: 'default-model', name: 'Default Model' }],
  };
  mocks.models.isPending = false;
  mocks.models.isError = false;
  mocks.models.isSuccess = true;
  harnessMocks.query.data = [];
  harnessMocks.query.isError = false;
  harnessMocks.pairing.isError = false;
  harnessMocks.deleteHarness.mockResolvedValue(undefined);
  harnessMocks.approve.mockResolvedValue(REGISTERED_HARNESS);
});

function renderHarness(
  props: {
    onBack?: () => void;
    onChooseModel?: (harness: { id: string; modelId: string }) => void;
  } = {}
) {
  return render(() => (
    <Harness
      onBack={props.onBack ?? vi.fn()}
      onChooseModel={props.onChooseModel ?? vi.fn()}
    />
  ));
}

describe('Harness', () => {
  it('shows an empty state until a machine is paired', () => {
    renderHarness();
    expect(screen.getByRole('heading', { name: 'Your harness' })).toBeTruthy();
    expect(screen.getByText('No paired machines yet')).toBeTruthy();
  });

  it('opens pairing from New runtime and returns to the list', () => {
    renderHarness();
    fireEvent.click(screen.getByRole('button', { name: 'New runtime' }));
    expect(screen.getByRole('region', { name: 'New runtime' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Your harness' })).toBeTruthy();
  });

  it('goes back to Agents from the harness page', () => {
    const onBack = vi.fn();
    renderHarness({ onBack });
    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders a registered harness and lets the user pick a model', () => {
    harnessMocks.query.data = [REGISTERED_HARNESS];
    const onChooseModel = vi.fn();
    renderHarness({ onChooseModel });

    expect(screen.getByText('Dev box')).toBeTruthy();
    expect(screen.getByText('Team')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Connected' })).toBeTruthy();
    chooseSelectOption(
      screen.getByLabelText('Models for Dev box'),
      'Default Model'
    );
    expect(onChooseModel).toHaveBeenCalledWith({
      id: REGISTERED_HARNESS.id,
      modelId: 'default-model',
    });
  });

  it('shows a disconnected private harness without a model picker', () => {
    harnessMocks.query.data = [
      {
        ...REGISTERED_HARNESS,
        owner: { type: 'user', user_id: 'macro|user@example.com' },
        connected: false,
        last_connected_at: null,
      },
    ];
    renderHarness();

    expect(screen.getByText('Private')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Disconnected' })).toBeTruthy();
    expect(screen.getByText('Never connected')).toBeTruthy();
    expect(
      screen.getByText('Reconnect this machine to load models.')
    ).toBeTruthy();
    expect(screen.queryByLabelText('Models for Dev box')).toBeNull();
  });

  it('keeps the harness page visible while models load', async () => {
    harnessMocks.query.data = [REGISTERED_HARNESS];
    let resolveModels!: (models: LoadAgentModelsResponse) => void;
    const response = new Promise<LoadAgentModelsResponse>((resolve) => {
      resolveModels = resolve;
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(useAgentModelsQuery).mockImplementationOnce(() =>
      useQuery(() => ({
        queryKey: ['pending-harness-models'],
        queryFn: () => response,
      }))
    );
    const view = render(() => (
      <QueryClientProvider client={client}>
        <Suspense fallback={<p>Settings suspended</p>}>
          <Harness onBack={vi.fn()} onChooseModel={vi.fn()} />
        </Suspense>
      </QueryClientProvider>
    ));
    expect(screen.queryByText('Settings suspended')).toBeNull();
    expect(screen.getByText('Loading models…')).toBeTruthy();
    resolveModels({
      status: 'available',
      currentModel: 'loaded-model',
      models: [{ id: 'loaded-model', name: 'Loaded Model' }],
    });
    await waitFor(() =>
      expect(screen.getByText('Choose a model')).toBeTruthy()
    );
    expect(screen.queryByText('Loading models…')).toBeNull();
    expect(screen.queryByText('Settings suspended')).toBeNull();
    view.unmount();
    client.clear();
  });

  it('confirms before removing a harness', async () => {
    harnessMocks.query.data = [REGISTERED_HARNESS];
    renderHarness();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Remove Dev box?')).toBeTruthy();
    expect(harnessMocks.deleteHarness).not.toHaveBeenCalled();

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Remove runtime' })
    );

    await waitFor(() => {
      expect(harnessMocks.deleteHarness).toHaveBeenCalledWith({
        harnessId: REGISTERED_HARNESS.id,
      });
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Runtime removed');
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
