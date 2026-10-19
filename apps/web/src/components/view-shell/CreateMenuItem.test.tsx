import TaskIcon from '@icon/system/regular/check-square.svg';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import type { ParentProps } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Dropdown } from '../ui/components/Dropdown';
import { CreateMenuItem } from './CreateMenuItem';

vi.mock('@ui', async () => ({
  ...(await import('../ui/components/Dropdown')),
  ...(await import('../ui/components/Layer')),
  ...(await import('../ui/utils/classname')),
}));
vi.mock('../ui/components/Tooltip', () => ({
  Tooltip: (props: ParentProps) => props.children,
}));
vi.mock('@core/mobile/isTouchDevice', () => ({ isTouchDevice: () => false }));
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('keeps the action name concise and associates the explanatory description', async () => {
  const onSelect = vi.fn();
  render(() => (
    <Dropdown defaultOpen>
      <Dropdown.Trigger>New</Dropdown.Trigger>
      <Dropdown.Content>
        <Dropdown.Group>
          <CreateMenuItem
            icon={TaskIcon}
            title="New Task"
            description="Track a standalone piece of work."
            onSelect={onSelect}
          />
        </Dropdown.Group>
      </Dropdown.Content>
    </Dropdown>
  ));
  const item = await screen.findByRole('menuitem', { name: 'New Task' });
  expect(
    document.getElementById(item.getAttribute('aria-describedby') ?? '')
      ?.textContent
  ).toBe('Track a standalone piece of work.');
  fireEvent.keyDown(item, { key: 'Enter' });
  expect(onSelect).toHaveBeenCalledOnce();
});
