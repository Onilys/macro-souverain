import { UserIcon } from '@core/component/UserIcon';
import ClockIcon from '@phosphor/clock.svg';
import { For, Show, createMemo } from 'solid-js';

export type TimeEntry = {
  userId: string;
  userName: string;
  taskId: string;
  taskName: string;
  minutes: number;
  date: string;
};

export type ProjectTimeProps = {
  projectId: string;
  projectName: string;
  entries: TimeEntry[];
};

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

type TimeByPerson = {
  userId: string;
  userName: string;
  totalMinutes: number;
  tasks: { taskId: string; taskName: string; minutes: number }[];
};

/** Project timesheet view showing time logged by person and task. */
export function ProjectTimeView(props: ProjectTimeProps) {
  const timeByPerson = createMemo((): TimeByPerson[] => {
    const byPerson = new Map<string, TimeByPerson>();

    for (const entry of props.entries) {
      let person = byPerson.get(entry.userId);
      if (!person) {
        person = {
          userId: entry.userId,
          userName: entry.userName,
          totalMinutes: 0,
          tasks: [],
        };
        byPerson.set(entry.userId, person);
      }
      person.totalMinutes += entry.minutes;

      const existingTask = person.tasks.find((t) => t.taskId === entry.taskId);
      if (existingTask) {
        existingTask.minutes += entry.minutes;
      } else {
        person.tasks.push({
          taskId: entry.taskId,
          taskName: entry.taskName,
          minutes: entry.minutes,
        });
      }
    }

    return [...byPerson.values()].sort(
      (a, b) => b.totalMinutes - a.totalMinutes
    );
  });

  const totalMinutes = createMemo(() =>
    props.entries.reduce((sum, e) => sum + e.minutes, 0)
  );

  return (
    <div class="h-full overflow-y-auto px-6 pb-8 pt-12 touch:pt-6">
      <div class="mx-auto max-w-3xl">
        <div class="mb-8 flex items-center gap-3">
          <ClockIcon class="size-6 text-ink-muted" />
          <h2 class="text-xl font-semibold">Time Tracking</h2>
        </div>

        <div class="mb-8 rounded-lg border border-edge bg-panel p-4">
          <div class="text-sm text-ink-muted">Total Time</div>
          <div class="text-2xl font-semibold">
            {formatDuration(totalMinutes())}
          </div>
        </div>

        <Show
          when={timeByPerson().length > 0}
          fallback={
            <div class="text-center text-ink-muted py-12">
              <ClockIcon class="mx-auto size-12 mb-4 opacity-50" />
              <p>No time logged yet</p>
              <p class="text-sm mt-2">
                Log time on tasks to see the timesheet here
              </p>
            </div>
          }
        >
          <h3 class="mb-4 text-lg font-medium">By Person</h3>
          <div class="space-y-4">
            <For each={timeByPerson()}>
              {(person) => (
                <div class="rounded-lg border border-edge bg-panel p-4">
                  <div class="flex items-center gap-3 mb-3">
                    <UserIcon
                      id={person.userId}
                      size="md"
                      showTooltip={false}
                    />
                    <div class="flex-1 min-w-0">
                      <div class="font-medium truncate">{person.userName}</div>
                      <div class="text-sm text-ink-muted">
                        {formatDuration(person.totalMinutes)}
                      </div>
                    </div>
                  </div>
                  <div class="ml-10 space-y-2">
                    <For each={person.tasks}>
                      {(task) => (
                        <div class="flex items-center justify-between text-sm">
                          <span class="text-ink-muted truncate">
                            {task.taskName}
                          </span>
                          <span class="shrink-0 ml-2">
                            {formatDuration(task.minutes)}
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
