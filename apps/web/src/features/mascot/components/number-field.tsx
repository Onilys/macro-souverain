import ArrowsHorizontal from '@phosphor/arrows-horizontal.svg';
import { NumberScrubInput } from '@ui/components/NumberScrubInput';

/** The canvas inspector's shared numeric control, connected to project history. */
export function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onStart: () => void;
  onInput: (value: number) => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  const commit = (value: number) => {
    props.onStart();
    props.onInput(value);
    props.onFinish();
  };
  return (
    <div class="flex items-center justify-between gap-3 text-sm">
      <span>{props.label}</span>
      <div class="w-28 shrink-0">
        <NumberScrubInput
          label={props.label}
          icon={<ArrowsHorizontal class="size-3" />}
          value={Number(props.value.toFixed(4))}
          min={props.min}
          max={props.max}
          step={props.step}
          onChange={commit}
          onScrub={() => {
            props.onFinish();
            props.onStart();
            return {
              preview: props.onInput,
              commit,
              cancel: props.onCancel,
            };
          }}
        />
      </div>
    </div>
  );
}
