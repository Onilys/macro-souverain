import { fireAndForget } from '@core/util/fireAndForget';
import { Telemetry } from '@macro-inc/observability';
import { debounce } from '@solid-primitives/scheduled';
import type { Result } from 'neverthrow';
import { type Accessor, createEffect, on, onCleanup } from 'solid-js';
import type {
  TaskPredictionInput,
  TaskPredictions,
} from '../core/task-predictions';

/** One provider call at a time; edits invalidate results before the debounce. */
export function createTaskPredictions(args: {
  input: Accessor<TaskPredictionInput>;
  userId: Accessor<string | undefined>;
  enabled: Accessor<boolean>;
  predict(
    input: TaskPredictionInput
  ): Promise<Result<TaskPredictions, unknown>>;
  apply(predictions: TaskPredictions): void;
}) {
  const draftId = crypto.randomUUID();
  let revision = 0;
  let disposed = false;
  let running = false;
  let pending:
    | { input: TaskPredictionInput; revision: number; userId: string }
    | undefined;

  const drain = async () => {
    if (running || disposed) return;
    running = true;
    try {
      while (pending && !disposed) {
        const request = pending;
        pending = undefined;
        await Telemetry.span('task.predict_properties', async (span) => {
          span.setAttr('draft.id', draftId);
          span.setAttr('draft.revision', request.revision);
          span.setAttr('project.count', request.input.projects.length);
          const result = await args.predict(request.input);
          if (result.isErr()) {
            span.error('Task property prediction failed');
            return;
          }
          // Compare the live input as well: Solid effects can run after a
          // promise callback in the same turn. Never apply to a submitted draft.
          if (
            disposed ||
            revision !== request.revision ||
            args.userId() !== request.userId ||
            !args.enabled() ||
            JSON.stringify(args.input()) !== JSON.stringify(request.input)
          ) {
            span.setAttr('prediction.stale', true);
            return;
          }
          args.apply(result.value);
        });
      }
    } finally {
      running = false;
    }
  };

  const schedule = debounce((request: NonNullable<typeof pending>) => {
    pending = request;
    fireAndForget(drain(), 'task-predictions');
  }, 700);

  createEffect(
    on([args.input, args.userId, args.enabled], ([input, userId, enabled]) => {
      revision++;
      pending = undefined;
      schedule.clear();
      if (
        !enabled ||
        !userId ||
        !(input.title.trim() || input.description.trim()) ||
        (!input.predictPriority &&
          (!input.predictProject || !input.projects.length))
      )
        return;
      schedule({ input, userId, revision });
    })
  );

  onCleanup(() => {
    disposed = true;
    pending = undefined;
    schedule.clear();
  });
}
