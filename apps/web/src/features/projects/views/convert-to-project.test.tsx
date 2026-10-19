import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import type { ParentProps } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConvertToProject } from './convert-to-project';

const mock = vi.hoisted(() => ({
  convertTask: vi.fn(),
  replaceOrInsertSplit: vi.fn(),
}));

vi.mock('@ui', async () => ({
  ...(await import('@app/components/ui/components/Button')),
  ...(await import('@app/components/ui/components/Dialog')),
  ...(await import('@app/components/ui/components/Surface')),
  ...(await import('@app/components/ui/utils/classname')),
  Hotkey: () => null,
}));
vi.mock('@app/components/ui/components/Tooltip', () => ({
  Tooltip: (props: ParentProps) => props.children,
}));
vi.mock('@core/mobile/isMobile', () => ({ isMobile: () => false }));
vi.mock('@core/component/Toast/Toast', () => ({
  toast: { success: vi.fn(), failure: vi.fn() },
}));
vi.mock('@components/app/split-layout/layout', () => ({
  useSplitLayout: () => ({ replaceOrInsertSplit: mock.replaceOrInsertSplit }),
}));
vi.mock('../context/projects-context', () => ({
  useProjectsContext: () => ({
    createCommands: () => ({
      pending: () => false,
      convertTask: mock.convertTask,
    }),
  }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  mock.convertTask.mockReset();
  mock.replaceOrInsertSplit.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ConvertToProject', () => {
  it('explains what carries over before converting', () => {
    render(() => (
      <ConvertToProject
        taskId="task-123"
        taskName="My Important Task"
        onClose={vi.fn()}
      />
    ));
    expect(
      screen.getByText(/"My Important Task" becomes a project/)
    ).toBeTruthy();
    expect(
      screen.getByText(/description, properties and comments/)
    ).toBeTruthy();
  });

  it('converts the task and opens the project that replaces it', async () => {
    mock.convertTask.mockResolvedValue({ id: 'project-1' });
    const close = vi.fn();
    render(() => (
      <ConvertToProject taskId="task-123" taskName="My Task" onClose={close} />
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Convert' }));

    await vi.waitFor(() => expect(close).toHaveBeenCalled());
    expect(mock.convertTask).toHaveBeenCalledWith('task-123');
    expect(mock.replaceOrInsertSplit).toHaveBeenCalledWith(
      {
        type: 'component',
        id: 'initiative-view~project-1~overview',
      },
      'entity-actions-menu'
    );
  });

  it('keeps the dialog open with the reason when conversion fails', async () => {
    mock.convertTask.mockRejectedValue(
      new Error('Only a task can become a project')
    );
    const close = vi.fn();
    render(() => (
      <ConvertToProject taskId="task-123" taskName="My Task" onClose={close} />
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Convert' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Only a task can become a project'
    );
    expect(close).not.toHaveBeenCalled();
    expect(mock.replaceOrInsertSplit).not.toHaveBeenCalled();
  });

  it('closes on cancel without converting', () => {
    const close = vi.fn();
    render(() => (
      <ConvertToProject taskId="task-123" taskName="My Task" onClose={close} />
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(close).toHaveBeenCalledOnce();
    expect(mock.convertTask).not.toHaveBeenCalled();
  });
});
