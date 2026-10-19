import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import type { ParentProps } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConvertToProject } from './convert-to-project';

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
vi.mock('@components/app/split-layout/layout', () => ({
  useSplitLayout: () => ({
    replaceOrInsertSplit: vi.fn(),
  }),
}));

const mockCreate = vi.fn();
const mockAssignTasks = vi.fn();

vi.mock('../context/projects-context', () => ({
  useProjectsContext: () => ({
    createCommands: () => ({
      pending: () => false,
      create: mockCreate,
      assignTasks: mockAssignTasks,
    }),
  }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  mockCreate.mockReset();
  mockAssignTasks.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ConvertToProject', () => {
  it('shows task name in the dialog', () => {
    render(() => (
      <ConvertToProject
        taskId="task-123"
        taskName="My Important Task"
        onClose={vi.fn()}
      />
    ));
    expect(
      screen.getByText(/create a new project named "My Important Task"/i)
    ).toBeTruthy();
  });

  it('calls create and assignTasks on convert', async () => {
    mockCreate.mockResolvedValue({ id: 'new-project-id' });
    mockAssignTasks.mockResolvedValue([]);
    const close = vi.fn();

    render(() => (
      <ConvertToProject taskId="task-123" taskName="My Task" onClose={close} />
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Convert' }));

    await vi.waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        name: 'My Task',
        description: '',
        shareWithTeam: true,
        properties: [],
      });
    });

    await vi.waitFor(() => {
      expect(mockAssignTasks).toHaveBeenCalledWith('new-project-id', [
        'task-123',
      ]);
    });

    await vi.waitFor(() => {
      expect(close).toHaveBeenCalled();
    });
  });

  it('shows error on failure', async () => {
    mockCreate.mockRejectedValue(new Error('Network error'));
    const close = vi.fn();

    render(() => (
      <ConvertToProject taskId="task-123" taskName="My Task" onClose={close} />
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Convert' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Network error'
    );
    expect(close).not.toHaveBeenCalled();
  });

  it('closes dialog on cancel', () => {
    const close = vi.fn();

    render(() => (
      <ConvertToProject taskId="task-123" taskName="My Task" onClose={close} />
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(close).toHaveBeenCalledOnce();
  });

  it('uses default name for empty task name', () => {
    render(() => (
      <ConvertToProject taskId="task-123" taskName="" onClose={vi.fn()} />
    ));
    expect(
      screen.getByText(/create a new project named "Untitled"/i)
    ).toBeTruthy();
  });
});
