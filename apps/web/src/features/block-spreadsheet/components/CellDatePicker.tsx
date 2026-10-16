import { floatWithElement } from '@core/component/LexicalMarkdown/directive/floatWithElement';
import { Calendar } from '@ui';
import { addDays } from 'date-fns/addDays';
import { addMonths } from 'date-fns/addMonths';
import { createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';

false && floatWithElement;

const DAY_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

/**
 * The `@date` calendar under a cell editor. It never takes focus, so the
 * editor keeps its draft: arrow keys and Page Up/Down move the highlighted
 * day, Enter or a click picks a day, and Escape closes it.
 */
export function CellDatePicker(props: {
  anchor: HTMLElement;
  onPick: (date: Date) => void;
  onClose: () => void;
}) {
  const now = new Date();
  const [focusedDay, setFocusedDay] = createSignal(
    new Date(now.getFullYear(), now.getMonth(), now.getDate())
  );
  const [month, setMonth] = createSignal(
    new Date(now.getFullYear(), now.getMonth(), 1)
  );
  // A copy: the calendar reports no change when a click selects the very
  // object it just focused.
  const highlighted = createMemo(() => new Date(focusedDay()));
  const focus = (day: Date) => {
    setFocusedDay(day);
    setMonth(new Date(day.getFullYear(), day.getMonth(), 1));
  };
  onMount(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const day = focusedDay();
      const step = DAY_STEPS[event.key];
      if (step) focus(addDays(day, step));
      else if (event.key === 'PageUp' || event.key === 'PageDown')
        focus(
          addMonths(
            day,
            (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1)
          )
        );
      else if (event.key === 'Enter') props.onPick(day);
      else if (event.key === 'Escape') props.onClose();
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener('keydown', keyDown, true);
    onCleanup(() => document.removeEventListener('keydown', keyDown, true));
  });
  return (
    <Portal>
      <div
        data-cell-date-picker
        class="z-action-menu w-64 rounded-lg border border-edge bg-panel p-3 text-ink shadow-xl"
        use:floatWithElement={{ element: () => props.anchor }}
        onPointerDown={(event) => event.preventDefault()}
        onMouseDown={(event) => event.preventDefault()}
      >
        <Calendar
          monthMenu={false}
          required
          value={highlighted()}
          onValueChange={(date) => {
            if (date) props.onPick(date);
          }}
          month={month()}
          onMonthChange={setMonth}
          focusedDay={focusedDay()}
          onFocusedDayChange={setFocusedDay}
        />
      </div>
    </Portal>
  );
}
