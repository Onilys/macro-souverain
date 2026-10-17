import { SYSTEM_PROPERTY_IDS } from '@property/identifiers';
import type { Property } from '@property/types';
import { useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import { useProjectsContext } from '../context/projects-context';

export type TimeEntry = {
  userId: string;
  userName: string;
  taskId: string;
  taskName: string;
  minutes: number;
};

export type ProjectTimeData = {
  entries: TimeEntry[];
  totalMinutes: number;
  byPerson: {
    userId: string;
    userName: string;
    totalMinutes: number;
    tasks: { taskId: string; taskName: string; minutes: number }[];
  }[];
};

function getTimeFromProperty(properties: Property[]): number {
  const timeProperty = properties.find(
    (p) => p.propertyDefinitionId === SYSTEM_PROPERTY_IDS.TIME_LOGGED
  );
  if (!timeProperty || timeProperty.valueType !== 'NUMBER') return 0;
  const value = 'value' in timeProperty ? timeProperty.value : null;
  return typeof value === 'number' ? value : 0;
}

function getAssigneesFromProperty(properties: Property[]): string[] {
  const assigneeProperty = properties.find(
    (p) => p.propertyDefinitionId === SYSTEM_PROPERTY_IDS.ASSIGNEES
  );
  if (!assigneeProperty || assigneeProperty.valueType !== 'ENTITY') return [];
  if ('values' in assigneeProperty && Array.isArray(assigneeProperty.values)) {
    return assigneeProperty.values
      .filter(
        (v): v is { entity_id: string } =>
          typeof v === 'object' && v !== null && 'entity_id' in v
      )
      .map((v) => v.entity_id);
  }
  return [];
}

export function useProjectTimeQuery(projectId: Accessor<string>) {
  const context = useProjectsContext();

  return useQuery(() => ({
    queryKey: ['project-time', projectId()],
    queryFn: async (): Promise<ProjectTimeData> => {
      const source = context.createProjectSource(projectId);
      const project = source.project();
      if (!project) {
        return { entries: [], totalMinutes: 0, byPerson: [] };
      }

      const entries: TimeEntry[] = [];
      const byPersonMap = new Map<
        string,
        {
          userId: string;
          userName: string;
          totalMinutes: number;
          tasks: Map<
            string,
            { taskId: string; taskName: string; minutes: number }
          >;
        }
      >();

      for (const taskId of project.taskIds) {
        const taskSource = context.createTaskSource?.(() => taskId);
        if (!taskSource) continue;

        const task = taskSource.task?.();
        const properties = taskSource.properties?.() ?? [];

        const minutes = getTimeFromProperty(properties);
        if (minutes <= 0) continue;

        const assignees = getAssigneesFromProperty(properties);
        const taskName = task?.name ?? 'Untitled task';

        for (const userId of assignees.length > 0
          ? assignees
          : ['unassigned']) {
          const entry: TimeEntry = {
            userId,
            userName: userId === 'unassigned' ? 'Unassigned' : userId,
            taskId,
            taskName,
            minutes: Math.round(minutes / (assignees.length || 1)),
          };
          entries.push(entry);

          let person = byPersonMap.get(userId);
          if (!person) {
            person = {
              userId,
              userName: entry.userName,
              totalMinutes: 0,
              tasks: new Map(),
            };
            byPersonMap.set(userId, person);
          }

          person.totalMinutes += entry.minutes;

          const existingTask = person.tasks.get(taskId);
          if (existingTask) {
            existingTask.minutes += entry.minutes;
          } else {
            person.tasks.set(taskId, {
              taskId,
              taskName,
              minutes: entry.minutes,
            });
          }
        }
      }

      const totalMinutes = entries.reduce((sum, e) => sum + e.minutes, 0);
      const byPerson = [...byPersonMap.values()]
        .map((p) => ({
          userId: p.userId,
          userName: p.userName,
          totalMinutes: p.totalMinutes,
          tasks: [...p.tasks.values()],
        }))
        .sort((a, b) => b.totalMinutes - a.totalMinutes);

      return { entries, totalMinutes, byPerson };
    },
    staleTime: 30_000,
  }));
}
