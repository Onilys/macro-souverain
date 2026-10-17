/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { Show } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentSettings } from './AgentSettings';

const searchParams = vi.hoisted(() => ({
  pair: undefined as string | undefined,
}));
const setSearchParams = vi.fn();
vi.mock('@solidjs/router', () => ({
  useSearchParams: () => [searchParams, setSearchParams],
}));

vi.mock('./Agents', () => ({
  Agents: (props: {
    onCursor: () => void;
    onSetUpRuntime: () => void;
    onManageRuntimes: () => void;
    startWith?: { harnessId: string; modelId: string };
  }) => (
    <div>
      <h1>Agents page</h1>
      <Show when={props.startWith}>
        {(draft) => (
          <p>
            Draft {draft().harnessId} {draft().modelId}
          </p>
        )}
      </Show>
      <button type="button" onClick={props.onCursor}>
        Connect Cursor
      </button>
      <button type="button" onClick={props.onSetUpRuntime}>
        Set up your own agent
      </button>
      <button type="button" onClick={props.onManageRuntimes}>
        Manage paired runtimes
      </button>
    </div>
  ),
}));

vi.mock('./CursorConnectPage', () => ({
  CursorConnectPage: (props: { onClose: () => void }) => (
    <div>
      <h1>Cursor guide</h1>
      <button type="button" onClick={props.onClose}>
        Back
      </button>
    </div>
  ),
}));

vi.mock('./RuntimePairingPage', () => ({
  RuntimePairingPage: (props: {
    onClose: () => void;
    initialCode?: string;
  }) => (
    <div>
      <h1>Pairing guide</h1>
      <Show when={props.initialCode}>{(code) => <p>Code {code()}</p>}</Show>
      <button type="button" onClick={props.onClose}>
        Back
      </button>
    </div>
  ),
}));

vi.mock('./Harness', () => ({
  Harness: (props: {
    onBack: () => void;
    onChooseModel: (harness: { id: string; modelId: string }) => void;
  }) => (
    <div>
      <h1>Your harness</h1>
      <button type="button" onClick={props.onBack}>
        Back
      </button>
      <button
        type="button"
        onClick={() => props.onChooseModel({ id: 'h1', modelId: 'm1' })}
      >
        Choose model
      </button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  searchParams.pair = undefined;
  setSearchParams.mockClear();
});

describe('AgentSettings', () => {
  it('opens each setup page from the agents page and comes back', () => {
    render(() => <AgentSettings />);
    expect(screen.getByRole('heading', { name: 'Agents page' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Connect Cursor' }));
    expect(screen.getByRole('heading', { name: 'Cursor guide' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    fireEvent.click(
      screen.getByRole('button', { name: 'Set up your own agent' })
    );
    expect(screen.getByRole('heading', { name: 'Pairing guide' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    fireEvent.click(
      screen.getByRole('button', { name: 'Manage paired runtimes' })
    );
    expect(screen.getByRole('heading', { name: 'Your harness' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('heading', { name: 'Agents page' })).toBeTruthy();
  });

  it('starts pairing when a pairing code is in the URL', () => {
    searchParams.pair = 'KX7M-4QHD';
    render(() => <AgentSettings />);
    expect(screen.getByRole('heading', { name: 'Pairing guide' })).toBeTruthy();
    expect(screen.getByText('Code KX7M-4QHD')).toBeTruthy();
    expect(setSearchParams).toHaveBeenCalledWith(
      { pair: undefined },
      { replace: true }
    );
  });

  it('creates an agent from a model chosen on the harness page', () => {
    render(() => <AgentSettings />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Manage paired runtimes' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose model' }));
    expect(screen.getByRole('heading', { name: 'Agents page' })).toBeTruthy();
    expect(screen.getByText('Draft h1 m1')).toBeTruthy();
  });
});
