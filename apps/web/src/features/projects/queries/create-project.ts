import { fireAndForget } from '@core/util/fireAndForget';
import { throwOnErr } from '@core/util/result';
import type { CacheHost } from '@graphql-cache/host/types';
import { propertyValueToApi } from '@property/api/converters';
import { toGraphqlSetPropertyValue } from '@queries/properties/graphql/entity';
import { refetchSoupEntity } from '@queries/soup/cache';
import type { CreateInitiativeInput } from '@service-storage/graphql/generated/graphql';
import type {
  initiativeClient,
  mapInitiativeDetail,
} from '@service-storage/initiative';
import { type QueryClient, useMutation } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import type { ProjectCreationInput } from '../context/projects-context';
import { captureProjectCacheScope } from './project-cache-scope';
import { seedProjectDetail } from './project-identity';
import { toProjectDetail } from './project-model';

type InitiativeDetail = ReturnType<typeof mapInitiativeDetail>;

/** The drafted values travel with the create, as a task's do. */
export function createInitiativeInput(
  input: ProjectCreationInput
): CreateInitiativeInput {
  return {
    name: input.name,
    description: input.description.trim() || undefined,
    shareWithTeam: input.shareWithTeam,
    propertyValues: input.properties.flatMap(({ property, value }) => {
      const graphqlValue = toGraphqlSetPropertyValue(
        propertyValueToApi(value, property.isMultiSelect)
      );
      // An unset value is already the server's default.
      return graphqlValue
        ? [
            {
              propertyDefinitionId: property.propertyDefinitionId,
              value: graphqlValue,
            },
          ]
        : [];
    }),
  };
}

/**
 * Seed the new project's detail as soon as the server answers, so it opens
 * without a second read; the lists catch up in the background.
 */
async function adoptCreatedProject(
  userId: Accessor<string | undefined>,
  cacheHost: () => CacheHost | undefined,
  write: () => Promise<InitiativeDetail>
) {
  const scope = captureProjectCacheScope(userId, cacheHost);
  try {
    const project = await write();
    if (scope.isCurrent()) {
      await seedProjectDetail(scope.viewer, project, scope.host);
      if (scope.isCurrent())
        fireAndForget(
          refetchSoupEntity(project.id, 'initiative', {
            ownTouch: true,
            refreshGraphql: true,
          }),
          'projects'
        );
    }
    return toProjectDetail(project);
  } finally {
    scope.dispose();
  }
}

/**
 * One request creates the project with its values. Like task creation, it
 * resolves as soon as the server answers: the response seeds the project's
 * detail, and the lists catch up in the background.
 */
export function createProjectMutation(
  client: Pick<typeof initiativeClient, 'create'>,
  cache: QueryClient,
  userId: Accessor<string | undefined>,
  cacheHost: () => CacheHost | undefined = () => undefined
) {
  return useMutation(
    () => ({
      mutationFn: (input: ProjectCreationInput) =>
        adoptCreatedProject(userId, cacheHost, () =>
          throwOnErr(() => client.create(createInitiativeInput(input)))
        ),
    }),
    () => cache
  );
}

/**
 * One request turns a task into a project in place. The task goes to the
 * trash, so every task list refreshes too.
 */
export function convertTaskMutation(
  client: Pick<typeof initiativeClient, 'convertTask'>,
  cache: QueryClient,
  userId: Accessor<string | undefined>,
  cacheHost: () => CacheHost | undefined = () => undefined,
  onConverted: () => Promise<unknown> = async () => {}
) {
  return useMutation(
    () => ({
      mutationFn: (taskId: string) =>
        adoptCreatedProject(userId, cacheHost, () =>
          throwOnErr(() => client.convertTask(taskId))
        ),
      onSuccess: onConverted,
    }),
    () => cache
  );
}
