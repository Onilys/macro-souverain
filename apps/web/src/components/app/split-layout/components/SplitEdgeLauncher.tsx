import './split-edge-launcher.css';
import { LIST_VIEW_ID } from '@app/constants/list-views';
import {
  runCreateAction,
  setCreateMenuOpen,
} from '@app/features/command/Launcher';
import SplitIcon from '@icon/system/regular/columns.svg';
import MoreIcon from '@icon/system/regular/dots-three.svg';
import MailIcon from '@icon/system/regular/envelope.svg';
import DocIcon from '@icon/system/regular/file-text.svg';
import PlusIcon from '@icon/system/regular/plus.svg';
import { Button } from '@ui';
import {
  createSignal,
  createUniqueId,
  For,
  onCleanup,
  onMount,
  useContext,
} from 'solid-js';
import { SplitLayoutContext } from '../context';

/** Desktop edge launcher; its entire transition reverses from the current frame. */
export function SplitEdgeLauncher() {
  const layout = useContext(SplitLayoutContext);
  const [open, setOpen] = createSignal(false);
  const [activeIndex, setActiveIndex] = createSignal(0);
  const menuId = createUniqueId();
  let root: HTMLDivElement | undefined;
  let trigger: HTMLButtonElement | undefined;
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger?.focus();
  };
  const actions = [
    {
      label: 'Split',
      name: 'Create new split',
      icon: SplitIcon,
      x: -48,
      y: -108,
      run: () =>
        layout?.manager.createNewSplit({
          content: { type: 'component', id: LIST_VIEW_ID.home },
          activate: true,
          allowDuplicate: true,
          referredFrom: 'dock',
        }),
    },
    {
      label: 'Email',
      name: 'New email in split',
      icon: MailIcon,
      x: -116,
      y: -40,
      run: () =>
        runCreateAction('email', { shouldInsert: true, source: 'split_edge' }),
    },
    {
      label: 'Doc',
      name: 'New document in split',
      icon: DocIcon,
      x: -116,
      y: 40,
      run: () =>
        runCreateAction('md', { shouldInsert: true, source: 'split_edge' }),
    },
    {
      label: 'More',
      name: 'More create options',
      icon: MoreIcon,
      x: -48,
      y: 108,
      run: () => setCreateMenuOpen(true),
    },
  ];
  const items = () =>
    Array.from(
      root?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
    );
  const focusFirst = () =>
    queueMicrotask(() => {
      if (open()) {
        setActiveIndex(0);
        items()[0]?.focus();
      }
    });
  onMount(() => {
    const dismiss = (event: PointerEvent) => {
      if (
        open() &&
        event.target instanceof Node &&
        !root?.contains(event.target)
      )
        close();
    };
    document.addEventListener('pointerdown', dismiss, true);
    onCleanup(() => document.removeEventListener('pointerdown', dismiss, true));
  });
  return (
    <div
      ref={root}
      class="split-edge-launcher"
      data-open={open() ? '' : undefined}
      data-icon-motion="none"
      onFocusOut={(event) => {
        if (
          !event.relatedTarget ||
          (event.relatedTarget instanceof Node &&
            !event.currentTarget.contains(event.relatedTarget))
        )
          close();
      }}
      onKeyDown={(event) => {
        if (open() && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
        if (open() && event.key === 'Tab') close();
        if (
          open() &&
          ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
        ) {
          event.preventDefault();
          const buttons = items();
          const active = document.activeElement;
          const index =
            active instanceof HTMLButtonElement ? buttons.indexOf(active) : -1;
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : (index +
                    (event.key === 'ArrowUp' ? -1 : 1) +
                    buttons.length) %
                  buttons.length;
          setActiveIndex(next);
          buttons[next]?.focus();
        }
      }}
    >
      <div class="split-edge-surface" aria-hidden="true" />
      <div
        id={menuId}
        role="menu"
        aria-label="Create in a split"
        inert={!open()}
        aria-hidden={!open()}
      >
        <For each={actions}>
          {(action, index) => (
            <Button
              variant="ghost"
              size="icon-md"
              noTouchResize
              role="menuitem"
              class="split-edge-action"
              aria-label={action.name}
              style={{
                '--edge-x': `${action.x}px`,
                '--edge-y': `${action.y}px`,
              }}
              tabIndex={open() && activeIndex() === index() ? 0 : -1}
              onFocus={() => setActiveIndex(index())}
              onClick={() => {
                close();
                action.run();
              }}
            >
              <span class="split-edge-label">{action.label}</span>
              <span class="split-edge-action-icon">
                <action.icon class="size-5" />
              </span>
            </Button>
          )}
        </For>
      </div>
      <Button
        ref={trigger}
        variant="ghost"
        size="icon-md"
        noTouchResize
        class="split-edge-trigger"
        aria-label={open() ? 'Cancel split creation' : 'Open split creation'}
        aria-haspopup="menu"
        aria-expanded={open()}
        aria-controls={menuId}
        onClick={() => {
          const next = !open();
          setOpen(next);
          if (next) focusFirst();
        }}
        onKeyDown={(event) => {
          if (!open() && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
            focusFirst();
          }
        }}
      >
        <PlusIcon class="size-6" />
      </Button>
    </div>
  );
}
