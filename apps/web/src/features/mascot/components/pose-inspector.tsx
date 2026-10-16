import { TabbedControl } from '@ui/components/TabbedControl';
import { createSignal, For, Show } from 'solid-js';
import {
  editablePose,
  type Selection,
  syncNeutral,
} from '../core/editor-selection';
import type { Motion, Project, Surface, Transform } from '../core/types';
import { NumberField } from './number-field';

type Field = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
};
const motionFields: Field[] = [
  { key: 'x', label: 'Move sideways', min: -2, max: 2, step: 0.05 },
  { key: 'y', label: 'Lift', min: -2, max: 2, step: 0.05 },
  { key: 'lean', label: 'Lean', min: -45, max: 45, step: 2 },
  { key: 'yaw', label: 'Body turn', min: -45, max: 45, step: 2 },
  { key: 'squash', label: 'Stretch / squash', min: 0.5, max: 1.5, step: 0.02 },
  ...(['headTilt', 'headYaw', 'headPitch'] as const).map((key, i) => ({
    key,
    label: ['Head tilt', 'Head turn', 'Head nod'][i],
    min: -45,
    max: 45,
    step: 2,
  })),
  ...(['gazeX', 'gazeY', 'smileL', 'smileR'] as const).map((key, i) => ({
    key,
    label: [
      'Gaze horizontal',
      'Gaze vertical',
      'Left expression',
      'Right expression',
    ][i],
    min: -1,
    max: 1,
    step: 0.05,
  })),
  ...(['blinkL', 'blinkR'] as const).map((key, i) => ({
    key,
    label: ['Left blink', 'Right blink'][i],
    min: 0,
    max: 1,
    step: 0.05,
  })),
];
const settingsFields: Field[] = [
  {
    key: 'introDuration',
    label: 'Logo duration (ms)',
    min: 300,
    max: 5000,
    step: 50,
  },
  {
    key: 'poseDuration',
    label: 'Expression duration (ms)',
    min: 100,
    max: 2000,
    step: 25,
  },
  {
    key: 'idleDuration',
    label: 'Idle duration (ms)',
    min: 200,
    max: 10000,
    step: 100,
  },
  {
    key: 'blinkDuration',
    label: 'Blink duration (ms)',
    min: 100,
    max: 1000,
    step: 20,
  },
  {
    key: 'anticipation',
    label: 'Anticipation / overshoot',
    min: 0,
    max: 2,
    step: 0.1,
  },
  { key: 'lookYaw', label: 'Look head yaw', min: 0, max: 35, step: 1 },
  { key: 'lookPitch', label: 'Look head nod', min: 0, max: 25, step: 1 },
  { key: 'lookGaze', label: 'Eye travel (×)', min: 0, max: 4, step: 0.1 },
];
const surfaceFields: Field[] = [
  { key: 'span', label: 'Gradient span', min: 0.1, max: 20, step: 0.1 },
  { key: 'offset', label: 'Gradient offset', min: -2, max: 2, step: 0.05 },
  { key: 'fresnel', label: 'Fresnel', min: 0, max: 1, step: 0.05 },
  { key: 'power', label: 'Fresnel power', min: 0.2, max: 10, step: 0.1 },
  { key: 'blend', label: 'Smooth minimum', min: 0, max: 3, step: 0.05 },
  { key: 'clay', label: 'Clay amount', min: 0, max: 1, step: 0.05 },
  { key: 'clayScale', label: 'Clay scale', min: 0.5, max: 5, step: 0.1 },
  { key: 'exposure', label: 'Exposure', min: 0.1, max: 2, step: 0.05 },
];
export function PoseInspector(props: {
  project: Project;
  selection: Selection;
  begin: () => void;
  finish: () => void;
  cancel: () => void;
  edit: (fn: (draft: Project) => void) => void;
}) {
  const [tab, setTab] = createSignal('rig');
  const [object, setObject] = createSignal(1);
  const number = (
    field: Field,
    value: () => number,
    change: (draft: Project, value: number) => void
  ) => (
    <NumberField
      {...field}
      value={value()}
      onStart={props.begin}
      onFinish={props.finish}
      onCancel={props.cancel}
      onInput={(value) =>
        props.edit((draft) => {
          change(draft, value);
          syncNeutral(draft, props.selection);
        })
      }
    />
  );
  const shape = (project: Project) =>
    props.selection.kind === 'logo' ? project.logo : project.base;
  const transform = (
    title: string,
    get: (project: Project) => Transform,
    offset: boolean
  ) => (
    <fieldset class="space-y-2">
      <legend class="mb-2 font-medium">{title}</legend>
      <For each={['position', 'rotation', 'scale'] as const}>
        {(key) => (
          <For each={['X', 'Y', 'Z']}>
            {(axis, i) =>
              number(
                {
                  key,
                  label: `${key} ${axis}`,
                  min:
                    key === 'scale'
                      ? offset
                        ? 0.25
                        : 0.1
                      : key === 'rotation'
                        ? offset
                          ? -180
                          : -360
                        : offset
                          ? -3
                          : -6,
                  max:
                    key === 'scale'
                      ? offset
                        ? 2
                        : 6
                      : key === 'rotation'
                        ? offset
                          ? 180
                          : 360
                        : offset
                          ? 3
                          : 6,
                  step: key === 'rotation' ? 5 : 0.05,
                },
                () => get(props.project)[key][i()],
                (draft, v) => {
                  get(draft)[key][i()] = v;
                }
              )
            }
          </For>
        )}
      </For>
      {number(
        {
          key: 'radius',
          label: offset ? 'Roundness offset' : 'Roundness',
          min: offset ? -1 : 0,
          max: offset ? 1 : 2,
          step: 0.05,
        },
        () => get(props.project).radius,
        (draft, v) => {
          get(draft).radius = v;
        }
      )}
    </fieldset>
  );
  return (
    <aside class="space-y-4 rounded-xl border border-edge-muted p-4">
      <TabbedControl
        list={['rig', 'motion', 'material', 'look'].map((value) => ({
          value,
          label: value,
        }))}
        value={tab()}
        onChange={(value) => {
          props.finish();
          setTab(value);
        }}
      />
      <label class="flex justify-between text-sm">
        Selected cuboid
        <select
          class="rounded border border-edge-muted bg-input px-2 text-ink"
          value={object()}
          onChange={(e) => setObject(Number(e.currentTarget.value))}
        >
          <For each={[0, 1, 2]}>
            {(index) => (
              <option value={index}>
                {props.project.base.objects[index].name}
              </option>
            )}
          </For>
        </select>
      </label>
      <Show when={tab() === 'rig'}>
        <p class="text-xs text-ink-muted">
          {props.selection.kind === 'logo'
            ? 'Starting logo geometry and camera.'
            : 'Shared neutral stack. Changes affect all target poses.'}
        </p>
        {transform('Cuboid', (p) => shape(p).objects[object()], false)}
        <fieldset class="space-y-2">
          <legend class="mb-2 font-medium">Camera</legend>
          <For each={['zoom', 'yaw', 'pitch'] as const}>
            {(key) =>
              number(
                {
                  key,
                  label: `Camera ${key}`,
                  min: key === 'zoom' ? 2 : key === 'yaw' ? -6.3 : -1.4,
                  max: key === 'zoom' ? 20 : key === 'yaw' ? 6.3 : 1.4,
                  step: key === 'zoom' ? 0.1 : 0.02,
                },
                () => shape(props.project).camera[key],
                (draft, v) => {
                  shape(draft).camera[key] = v;
                }
              )
            }
          </For>
        </fieldset>
        <fieldset class="space-y-2">
          <legend class="mb-2 font-medium">Face attachment</legend>
          <label class="flex justify-between text-sm">
            Eyes attached to
            <select
              aria-label="Eyes attached to"
              class="rounded border border-edge-muted bg-input text-ink"
              value={props.project.base.eyes.objectIndex}
              onChange={(e) => {
                props.begin();
                props.edit((p) => {
                  p.base.eyes.objectIndex = Number(e.currentTarget.value);
                });
                props.finish();
              }}
            >
              <For each={[0, 1, 2]}>
                {(index) => (
                  <option value={index}>
                    {props.project.base.objects[index].name}
                  </option>
                )}
              </For>
            </select>
          </label>
          <For each={['radius', 'spacing', 'offsetY', 'offsetZ'] as const}>
            {(key) =>
              number(
                {
                  key,
                  label: `Eye ${key}`,
                  min: key === 'radius' ? 0.02 : key === 'spacing' ? 0.1 : -1,
                  max: key === 'radius' ? 0.3 : key === 'spacing' ? 2 : 1,
                  step: 0.02,
                },
                () => props.project.base.eyes[key],
                (draft, v) => {
                  draft.base.eyes[key] = v;
                }
              )
            }
          </For>
        </fieldset>
      </Show>
      <Show when={tab() === 'motion'}>
        <Show
          when={editablePose(props.project, props.selection)}
          fallback={
            <p class="text-sm text-ink-muted">
              Select neutral, an expression, or an idle pose to author motion.
            </p>
          }
        >
          <For each={motionFields}>
            {(field) =>
              number(
                field,
                () =>
                  editablePose(props.project, props.selection)!.motion[
                    field.key as keyof Motion
                  ],
                (draft, v) => {
                  editablePose(draft, props.selection)!.motion[
                    field.key as keyof Motion
                  ] = v;
                }
              )
            }
          </For>
          {transform(
            'Cuboid pose offset',
            (p) => editablePose(p, props.selection)!.objects[object()],
            true
          )}
        </Show>
      </Show>
      <Show when={tab() === 'material'}>
        <p class="text-xs text-ink-muted">
          World-space gradient, Fresnel and clay. Shared by all poses.
        </p>
        <For each={['dark', 'light', 'rim', 'background'] as const}>
          {(key) => (
            <label class="flex justify-between text-sm">
              {key}
              <input
                aria-label={`${key} color`}
                type="color"
                value={props.project.base.surface[key]}
                onFocus={props.begin}
                onInput={(e) =>
                  props.edit((p) => {
                    p.base.surface[key] = e.currentTarget.value;
                  })
                }
                onChange={props.finish}
                onBlur={props.finish}
              />
            </label>
          )}
        </For>
        <For each={surfaceFields}>
          {(field) =>
            number(
              field,
              () =>
                props.project.base.surface[
                  field.key as keyof Surface
                ] as number,
              (p, v) => {
                (p.base.surface as unknown as Record<string, number>)[
                  field.key
                ] = v;
              }
            )
          }
        </For>
        <For each={['direction', 'gradientRotation'] as const}>
          {(key) => (
            <For each={['X', 'Y', 'Z']}>
              {(axis, i) =>
                number(
                  {
                    key,
                    label: `${key} ${axis}`,
                    min: key === 'direction' ? -10 : -360,
                    max: key === 'direction' ? 10 : 360,
                    step: key === 'direction' ? 0.1 : 5,
                  },
                  () => props.project.base.surface[key][i()],
                  (p, v) => {
                    p.base.surface[key][i()] = v;
                  }
                )
              }
            </For>
          )}
        </For>
      </Show>
      <Show when={tab() === 'look'}>
        <p class="text-xs text-ink-muted">
          Looks start from neutral. Center keeps these controls available. Eye
          travel supports the full 0–4× range.
        </p>
      </Show>
      <Show when={tab() === 'look' || tab() === 'motion'}>
        <fieldset class="space-y-2">
          <legend class="mb-2 font-medium">Generated motion</legend>
          <For
            each={settingsFields.filter((f) =>
              tab() === 'look'
                ? f.key.startsWith('look')
                : !f.key.startsWith('look')
            )}
          >
            {(field) =>
              number(
                field,
                () =>
                  props.project.settings[
                    field.key as keyof Project['settings']
                  ],
                (p, v) => {
                  p.settings[field.key as keyof Project['settings']] = v;
                }
              )
            }
          </For>
        </fieldset>
      </Show>
    </aside>
  );
}
