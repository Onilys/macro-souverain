import { TabsInset } from '@core/component/TabsInset';
import RowsIcon from '@phosphor/rows.svg';
import SquareSplitHorizontalIcon from '@phosphor/square-split-horizontal.svg';
import type { Component } from 'solid-js';
import { match } from 'ts-pattern';
import { useEmailView } from '../email-view-context';
import type { EmailLayout } from '../types';

const LAYOUTS: {
  value: EmailLayout;
  label: string;
  icon: Component<{ class?: string }>;
}[] = [
  { value: 'preview', label: 'Preview', icon: SquareSplitHorizontalIcon },
  { value: 'list', label: 'List', icon: RowsIcon },
];

/** Switches the desktop view between the Preview and List layouts. */
export function EmailLayoutToggle() {
  const { layout, setLayout } = useEmailView();

  return (
    <TabsInset
      aria-label="Email layout"
      fullWidth
      class="h-auto"
      labelClass="gap-1.5 py-1.5"
      list={LAYOUTS.map((item) => ({
        value: item.value,
        label: (
          <>
            <item.icon class="size-3.5 shrink-0" aria-hidden="true" />
            {item.label}
          </>
        ),
      }))}
      value={layout()}
      onChange={(value) =>
        match(value)
          .with('preview', 'list', (next) => setLayout(next))
          .otherwise(() => undefined)
      }
    />
  );
}
