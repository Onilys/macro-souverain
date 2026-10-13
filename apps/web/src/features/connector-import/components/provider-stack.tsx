import { cn } from '@ui';
import { For } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { ImportProvider } from '../core/providers';

const SIZES = {
  sm: { pill: 'size-6', icon: 'size-3.5', overlap: '-space-x-1.5' },
  md: { pill: 'size-9', icon: 'size-5', overlap: '-space-x-2.5' },
};

/** Provider logos as overlapping round pills, first provider on top. */
export function ProviderStack(props: {
  providers: readonly Pick<ImportProvider, 'appSlug' | 'name' | 'icon'>[];
  size?: keyof typeof SIZES;
  class?: string;
}) {
  const size = () => SIZES[props.size ?? 'sm'];
  return (
    <ul
      class={cn('isolate flex items-center', size().overlap, props.class)}
      aria-label={props.providers.map((provider) => provider.name).join(', ')}
    >
      <For each={props.providers}>
        {(provider, index) => (
          <li
            class={cn(
              'flex shrink-0 items-center justify-center rounded-full border border-edge-muted bg-surface ring-2 ring-(--provider-stack-separator,var(--color-control))',
              size().pill
            )}
            style={{ 'z-index': props.providers.length - index() }}
            title={provider.name}
          >
            <Dynamic
              component={provider.icon}
              class={cn('text-ink', size().icon)}
              aria-hidden="true"
            />
          </li>
        )}
      </For>
    </ul>
  );
}
