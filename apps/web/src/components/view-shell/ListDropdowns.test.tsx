import { Combobox } from '@kobalte/core/combobox';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library';
import { createSignal, For, type JSX, type ParentProps } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SearchableMultiSelect } from '../../features/next-soup/soup-view/filters-bar/searchable-multi-select';
import type { AiFilterOutcome } from './AiFilterInput';
import { ListFilterDropdown } from './ListDropdowns';

// Exercise the actual menus/comboboxes without initializing the app UI barrel.
vi.mock('@ui', async () => ({
  ...(await import('../ui/utils/classname')),
  ...(await import('../ui/components/Dropdown')),
  ...(await import('../ui/components/Layer')),
}));
vi.mock('../ui/components/Tooltip', () => ({
  Tooltip: (props: ParentProps) => props.children,
}));
vi.mock('@core/mobile/isTouchDevice', () => ({ isTouchDevice: () => false }));
vi.mock('@core/mobile/inputModality', () => ({ isModality: () => false }));
// jsdom has no viewport measurements. Keep the real Kobalte options and events.
vi.mock('virtua/solid', () => ({
  Virtualizer: (props: {
    data: unknown[];
    children: (item: unknown) => JSX.Element;
  }) => <For each={props.data}>{props.children}</For>,
}));

let motionStyles: HTMLStyleElement;
beforeEach(() => {
  motionStyles = document.createElement('style');
  motionStyles.textContent =
    '* { transition-duration: 0s; animation-name: none; }';
  document.head.append(motionStyles);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('scrollTo', vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  motionStyles.remove();
  vi.unstubAllGlobals();
});

function setup(single = false, searchable = false) {
  const [selected, setSelected] = createSignal<string[]>([]);
  const [open, setOpen] = createSignal(true);
  render(() => (
    <ListFilterDropdown
      label="Filter tasks"
      open={open()}
      onOpenChange={setOpen}
      groups={[
        {
          id: 'people',
          label: 'Assignee',
          selectionMode: single ? 'single' : 'multiple',
          searchPlaceholder: searchable ? 'Search assignees...' : undefined,
          options: [
            { id: 'alice', label: 'Alice' },
            { id: 'bob', label: 'Bob' },
            { id: 'carol', label: 'Carol' },
          ],
        },
        {
          id: 'scope',
          label: 'Files',
          selectionMode: 'single',
          options: [{ id: 'all', label: 'All files' }],
        },
      ]}
      isSelected={(_, id) => selected().includes(id)}
      onSelectionChange={(_, id, checked) =>
        setSelected((ids) =>
          checked
            ? single
              ? [id]
              : [...ids, id]
            : ids.filter((value) => value !== id)
        )
      }
      onClear={() => setSelected([])}
    />
  ));
  return { selected, open, setOpen };
}

function selectOption(element: HTMLElement) {
  fireEvent(element, new MouseEvent('pointerup', { button: 0, bubbles: true }));
}

async function openSubmenu() {
  const trigger = await screen.findByRole('menuitem', { name: 'Assignee' });
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  fireEvent.keyDown(trigger, { key: 'ArrowRight' });
}

it.each(['pointer', 'keyboard'])(
  'keeps multi-select menus open while adding and removing filters (%s)',
  async (input) => {
    const { selected, open } = setup();
    await openSubmenu();
    const toggle = (name: string) => {
      const option = screen.getByRole('menuitemcheckbox', { name });
      if (input === 'pointer') selectOption(option);
      else fireEvent.keyDown(option, { key: 'Enter' });
    };
    await screen.findByRole('menuitemcheckbox', { name: 'Alice' });
    toggle('Alice');
    toggle('Bob');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(selected()).toEqual(['alice', 'bob']);
    expect(open()).toBe(true);
    toggle('Alice');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(selected()).toEqual(['bob']);
    expect(open()).toBe(true);
    expect(
      screen
        .getByRole('menuitemcheckbox', { name: 'Bob' })
        .getAttribute('aria-checked')
    ).toBe('true');
  }
);

function clickSearchOption(element: HTMLElement) {
  for (const type of ['pointerdown', 'pointerup', 'click']) {
    const event = new MouseEvent(type, {
      button: 0,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'pointerType', { value: 'mouse' });
    fireEvent(element, event);
  }
}

it('keeps searchable submenus open while toggling several options', async () => {
  const { selected, open } = setup(false, true);
  await openSubmenu();
  clickSearchOption(await screen.findByRole('option', { name: 'Alice' }));
  await waitFor(() => expect(selected()).toEqual(['alice']));
  clickSearchOption(screen.getByRole('option', { name: 'Carol' }));
  await waitFor(() => expect(selected()).toEqual(['alice', 'carol']));
  clickSearchOption(screen.getByRole('option', { name: 'Alice' }));
  await waitFor(() => expect(selected()).toEqual(['carol']));
  expect(open()).toBe(true);
  expect(screen.getByPlaceholderText('Search assignees...')).toBeTruthy();
});

it('standalone searchable filters stay open while toggling options', async () => {
  const [selected, setSelected] = createSignal<string[]>([]);
  const [open, setOpen] = createSignal(true);
  render(() => (
    <SearchableMultiSelect
      options={() => [
        { id: 'alice', label: 'Alice' },
        { id: 'bob', label: 'Bob' },
      ]}
      activeIds={selected}
      onChange={setSelected}
      open={open}
      onOpenChange={setOpen}
    >
      <Combobox.Trigger>People</Combobox.Trigger>
    </SearchableMultiSelect>
  ));
  clickSearchOption(await screen.findByRole('option', { name: 'Alice' }));
  await waitFor(() => expect(selected()).toEqual(['alice']));
  clickSearchOption(screen.getByRole('option', { name: 'Bob' }));
  await waitFor(() => expect(selected()).toEqual(['alice', 'bob']));
  expect(open()).toBe(true);
});

function mousePointer(element: HTMLElement, type: string) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  fireEvent(element, event);
}

function crossMenuPadding() {
  const trigger = screen.getByRole('menuitem', { name: 'Assignee' });
  mousePointer(trigger, 'pointerleave');
  // jsdom has no layout for Kobalte's grace polygon. Reproduce the background
  // focus it performs when the mouse leaves that polygon into menu padding.
  trigger.closest<HTMLElement>('[role="menu"]')!.focus();
}

it.each([false, true])(
  'switches immediately to a hovered sibling instead of preserving the old submenu (searchable: %s)',
  async (searchable) => {
    setup(false, searchable);
    await openSubmenu();
    if (searchable) {
      const input = await screen.findByPlaceholderText('Search assignees...');
      await waitFor(() => expect(document.activeElement).toBe(input));
    } else await screen.findByRole('menuitemcheckbox', { name: 'Alice' });

    crossMenuPadding();
    const files = screen.getByRole('menuitem', { name: 'Files' });
    mousePointer(files, 'pointerenter');
    // Kobalte may suppress pointermove while inside the old submenu's grace
    // polygon. Entering Files must work even without a subsequent pointermove.
    expect(files.getAttribute('aria-expanded')).toBe('true');
    expect(
      screen
        .getByRole('menuitem', { name: 'Assignee' })
        .getAttribute('aria-expanded')
    ).toBe('false');
    expect(
      await screen.findByRole('menuitemradio', { name: 'All files' })
    ).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(files.getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByPlaceholderText('Search assignees...')).toBeNull();
  }
);

it('keeps a submenu open while crossing padding, cancelling dismissal on entry', async () => {
  setup();
  await openSubmenu();
  const option = await screen.findByRole('menuitemcheckbox', { name: 'Alice' });
  const submenu = option.closest<HTMLElement>('[role="menu"]')!;

  crossMenuPadding();
  expect(option.isConnected).toBe(true);
  mousePointer(submenu, 'pointerenter');
  mousePointer(option, 'pointermove');
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(option.isConnected).toBe(true);
  selectOption(option);
  expect(option.getAttribute('aria-checked')).toBe('true');
});

it('closes the submenu after lingering in the padding', async () => {
  setup();
  await openSubmenu();
  await screen.findByRole('menuitemcheckbox', { name: 'Alice' });
  crossMenuPadding();
  expect(screen.getByRole('menuitemcheckbox', { name: 'Alice' })).toBeTruthy();
  await waitFor(() =>
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Alice' })).toBeNull()
  );
});

it('dismisses immediately with Escape during the pointer grace period', async () => {
  const { open } = setup();
  await openSubmenu();
  await screen.findByRole('menuitemcheckbox', { name: 'Alice' });
  crossMenuPadding();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(open()).toBe(false);
});

it('dismisses on an outside click during the pointer grace period', async () => {
  const { open } = setup();
  await openSubmenu();
  await screen.findByRole('menuitemcheckbox', { name: 'Alice' });
  // Outside-interaction listeners register on the next tick after mounting.
  await new Promise((resolve) => setTimeout(resolve, 0));
  crossMenuPadding();
  mousePointer(document.body, 'pointerdown');
  expect(open()).toBe(false);
});

it('also preserves a searchable submenu when crossing the parent padding', async () => {
  setup(false, true);
  await openSubmenu();
  const input = await screen.findByPlaceholderText('Search assignees...');
  await waitFor(() => expect(document.activeElement).toBe(input));
  crossMenuPadding();
  expect(input.isConnected).toBe(true);
  mousePointer(input.closest<HTMLElement>('[role="menu"]')!, 'pointerenter');
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(input.isConnected).toBe(true);
  expect(document.activeElement).toBe(input);
});

it('closes a single-select menu after choosing an option and retains it on reopen', async () => {
  const { selected, open, setOpen } = setup(true);
  await openSubmenu();
  selectOption(await screen.findByRole('menuitemradio', { name: 'Alice' }));
  expect(selected()).toEqual(['alice']);
  await waitFor(() => expect(open()).toBe(false));
  setOpen(true);
  await openSubmenu();
  expect(
    (await screen.findByRole('menuitemradio', { name: 'Alice' })).getAttribute(
      'aria-checked'
    )
  ).toBe('true');
  selectOption(screen.getByRole('menuitemradio', { name: 'Bob' }));
  expect(selected()).toEqual(['bob']);
  await waitFor(() => expect(open()).toBe(false));
});

it('focuses searchable submenus on opening and reopening and supports keyboard selection', async () => {
  const { selected, open, setOpen } = setup(false, true);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) setOpen(true);
    await openSubmenu();
    const input = await screen.findByPlaceholderText('Search assignees...');
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.input(input, { target: { value: attempt ? 'Bob' : 'Alice' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(selected()).toEqual(attempt ? ['alice', 'bob'] : ['alice'])
    );
    expect(open()).toBe(true);
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Search assignees...')).toBeNull()
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(open()).toBe(false));
  }
});

function setupAiFilter(onSubmit: (query: string) => Promise<AiFilterOutcome>) {
  const [open, setOpen] = createSignal(true);
  render(() => (
    <ListFilterDropdown
      label="Filter tasks"
      open={open()}
      onOpenChange={setOpen}
      groups={[
        {
          id: 'people',
          label: 'Assignee',
          options: [{ id: 'alice', label: 'Alice' }],
        },
      ]}
      isSelected={() => false}
      onSelectionChange={() => {}}
      aiFilter={{ placeholder: 'Filter with AI…', onSubmit }}
    />
  ));
  return { open };
}

it('focuses the AI input when the menu opens, with ArrowDown reaching the first row', async () => {
  setupAiFilter(async () => ({ status: 'applied' }) as const);
  const input = await screen.findByPlaceholderText('Filter with AI…');
  await waitFor(() => expect(document.activeElement).toBe(input));
  // Kobalte's deferred menu focus must not win afterwards.
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(document.activeElement).toBe(input);

  fireEvent.keyDown(input, { key: 'ArrowDown' });
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('menuitem', { name: 'Assignee' })
    )
  );
});

it('submits the AI filter description on Enter and closes once it applies', async () => {
  const onSubmit = vi.fn(async () => ({ status: 'applied' }) as const);
  const { open } = setupAiFilter(onSubmit);
  const input = await screen.findByPlaceholderText('Filter with AI…');
  fireEvent.input(input, { target: { value: 'high priority only' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onSubmit).toHaveBeenCalledWith('high priority only');
  await waitFor(() => expect(open()).toBe(false));
});

it('keeps the menu open with feedback when the request only partly maps', async () => {
  const { open } = setupAiFilter(async () => ({
    status: 'applied',
    note: 'Tags cannot be excluded.',
  }));
  const input = await screen.findByPlaceholderText('Filter with AI…');
  fireEvent.input(input, { target: { value: 'no dev tasks' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect((await screen.findByRole('status')).textContent).toBe(
    'Tags cannot be excluded.'
  );
  expect(open()).toBe(true);
  expect((input as HTMLInputElement).value).toBe('');
});

it('shows an error and keeps the description when the request fails', async () => {
  const { open } = setupAiFilter(async () => ({
    status: 'error',
    message: 'AI filtering is unavailable right now.',
  }));
  const input = await screen.findByPlaceholderText('Filter with AI…');
  fireEvent.input(input, { target: { value: 'urgent tasks' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect((await screen.findByRole('alert')).textContent).toBe(
    'AI filtering is unavailable right now.'
  );
  expect(open()).toBe(true);
  expect((input as HTMLInputElement).value).toBe('urgent tasks');
});

it('hands focus back to the AI input when a hovered row steals it mid-description', async () => {
  setupAiFilter(async () => ({ status: 'applied' }) as const);
  const input = await screen.findByPlaceholderText('Filter with AI…');
  const row = screen.getByRole('menuitem', { name: 'Assignee' });
  await waitFor(() => expect(document.activeElement).toBe(input));
  fireEvent.input(input, { target: { value: 'urgent' } });
  expect(document.activeElement).toBe(input);

  // Kobalte focuses whichever row the mouse moves over.
  row.focus();
  await waitFor(() => expect(document.activeElement).toBe(input));

  // Keyboard navigation is a deliberate hand-off and must stick.
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  row.focus();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(document.activeElement).toBe(row);
});

it('ignores Enter on an empty description and leaves the option rows reachable', async () => {
  const onSubmit = vi.fn(async () => ({ status: 'applied' }) as const);
  setupAiFilter(onSubmit);
  const input = await screen.findByPlaceholderText('Filter with AI…');
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByRole('menuitem', { name: 'Assignee' })).toBeTruthy();
});
