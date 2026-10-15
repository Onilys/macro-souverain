import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal, For } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RadioGroup } from './RadioGroup';

const OPTIONS = [
  { value: 'this_event', label: 'This event' },
  { value: 'all', label: 'All events' },
];

function Fixture(props: { onChange?: (value: string) => void }) {
  const [value, setValue] = createSignal('this_event');
  return (
    <RadioGroup
      value={value()}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
      aria-label="Apply changes to"
    >
      <For each={OPTIONS}>
        {(option) => (
          <RadioGroup.Item value={option.value}>
            <RadioGroup.ItemControl />
            <RadioGroup.ItemLabel>{option.label}</RadioGroup.ItemLabel>
          </RadioGroup.Item>
        )}
      </For>
    </RadioGroup>
  );
}

afterEach(cleanup);

describe('RadioGroup', () => {
  it('emits the new value and moves the selection on change', () => {
    const onChange = vi.fn();
    render(() => <Fixture onChange={onChange} />);
    const initial = screen.getByRole('radio', {
      name: 'This event',
    }) as HTMLInputElement;
    const target = screen.getByRole('radio', {
      name: 'All events',
    }) as HTMLInputElement;
    expect(initial.checked).toBe(true);
    expect(target.checked).toBe(false);

    fireEvent.click(target);

    expect(onChange).toHaveBeenCalledWith('all');
    expect(target.checked).toBe(true);
    expect(initial.checked).toBe(false);
  });
});
