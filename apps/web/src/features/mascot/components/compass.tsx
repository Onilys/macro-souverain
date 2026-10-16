import { Button } from '@ui/components/Button';
import { For } from 'solid-js';
import type { LookIndex } from '../core/types';

const cells: { label: string; index: LookIndex | null }[] = [
  { label: 'NW', index: 7 },
  { label: 'N', index: 0 },
  { label: 'NE', index: 1 },
  { label: 'W', index: 6 },
  { label: 'Neutral', index: null },
  { label: 'E', index: 2 },
  { label: 'SW', index: 5 },
  { label: 'S', index: 4 },
  { label: 'SE', index: 3 },
];
export function Compass(props: {
  value: LookIndex | null;
  onChange: (index: LookIndex | null) => void;
}) {
  return (
    <div
      class="grid w-56 grid-cols-3 gap-1"
      role="group"
      aria-label="Look direction"
    >
      <For each={cells}>
        {(cell) => (
          <Button
            variant="outline"
            aria-pressed={props.value === cell.index}
            onClick={() => props.onChange(cell.index)}
          >
            {cell.label}
          </Button>
        )}
      </For>
    </div>
  );
}
