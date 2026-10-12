import XIcon from '@phosphor/x.svg';
import { Button } from '@ui';
import type { ImportCategoryConfig } from '../core/providers';
import { ProviderStack } from './provider-stack';
import { SecurityNote } from './security-note';

/** The sidebar prompt to bring a category's data over from other apps. */
export function ImportPromoCard(props: {
  config: ImportCategoryConfig;
  onOpen(trigger: HTMLButtonElement): void;
  onDismiss(): void;
}) {
  return (
    <section
      class="w-full rounded-xl border border-edge-muted bg-control px-2 py-3"
      aria-label={props.config.headline}
    >
      <div class="flex items-start justify-between gap-2">
        <ProviderStack providers={props.config.providers} class="mt-0.5" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Dismiss ${props.config.action.toLowerCase()}`}
          onClick={() => props.onDismiss()}
        >
          <XIcon class="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      <h2 class="mt-2.5 text-xs font-medium text-ink">
        {props.config.headline}
      </h2>
      <p class="mt-1 text-xs leading-relaxed text-ink-muted">
        {props.config.pitch}
      </p>
      <SecurityNote class="mt-2" />
      <Button
        variant="outline"
        size="sm"
        class="mt-3 w-full"
        onClick={(event) => props.onOpen(event.currentTarget)}
      >
        {props.config.action}
      </Button>
    </section>
  );
}
