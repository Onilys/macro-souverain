import CaretDownIcon from '@icon/system/regular/caret-down.svg';
import PlusIcon from '@icon/system/regular/plus.svg';
import { Button, type ButtonProps } from '@ui';
import {
  type Accessor,
  createContext,
  Show,
  splitProps,
  useContext,
} from 'solid-js';

export const SidebarCreatePresentation = createContext<Accessor<string>>();

const creationLabels: Record<string, string> = {
  Home: 'New Chat',
  Drive: 'New File',
  Tasks: 'New Task',
  Projects: 'New Project',
  Email: 'New Email',
  Calendar: 'New Event',
  Chat: 'New Message',
  Agents: 'New agent',
  Routines: 'New Routine',
  Customers: 'New record',
  Calls: 'New Call',
};

/** Unframed creation titles in navigation; compact actions in main toolbars. */
export function SidebarCreateAction(
  props: Omit<ButtonProps, 'variant' | 'size' | 'class'> & {
    sidebarLabel?: string;
  }
) {
  const [local, rest] = splitProps(props, ['sidebarLabel', 'children']);
  const sidebar = useContext(SidebarCreatePresentation);
  const description = () => creationLabels[sidebar?.() ?? ''];
  return (
    <Button
      {...rest}
      variant={sidebar ? 'ghost' : 'outline'}
      size="md"
      fullWidth={false}
      glass={false}
      data-sidebar-create=""
      tooltip={props.tooltip ?? props['aria-label'] ?? props.label}
      class={
        sidebar
          ? 'h-8 w-max shrink-0 justify-start gap-1.5 rounded-md border-0 px-2 text-xl leading-7 font-semibold tracking-[-0.025em] text-ink-muted'
          : 'h-8 min-w-8 gap-1.5 px-3 text-sm leading-5'
      }
    >
      <Show
        when={sidebar}
        fallback={
          <>
            <PlusIcon class="size-3.5 shrink-0" />
            {local.children}
          </>
        }
      >
        <span class="shrink-0 whitespace-nowrap bg-linear-to-br from-ink from-15% to-ink-subtle to-85% bg-clip-text text-transparent forced-colors:bg-none forced-colors:text-ink-muted">
          {local.sidebarLabel ??
            description() ??
            props['aria-label'] ??
            props.label ??
            'New'}
        </span>
        <CaretDownIcon class="size-4 shrink-0" />
      </Show>
    </Button>
  );
}
