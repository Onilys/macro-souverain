import { PROPERTY_OPTION_IDS } from '@property/identifiers';
import { cognitionApiServiceClient } from '@service-cognition/client';
import type { DecisionRequest } from '@service-cognition/generated/schemas/decisionRequest';
import {
  confidentPrediction,
  type TaskPredictionInput,
  type TaskPredictions,
} from '../core/task-predictions';

const priorityQuestions = {
  [PROPERTY_OPTION_IDS.PRIORITY.LOW]:
    'Does the author describe this task as low priority, optional, unimportant, or not important? Lack of an urgent deadline alone does not mean low priority. Respect negation.',
  [PROPERTY_OPTION_IDS.PRIORITY.MEDIUM]:
    'Does the author explicitly describe this task as normal or medium priority? Do not choose this when the task is marked important, high priority, urgent, or low priority.',
  [PROPERTY_OPTION_IDS.PRIORITY.HIGH]:
    'Does the author mark this task important or high priority, including a parenthetical (important), without explicitly requesting urgent or immediate action or describing an emergency? Importance alone means high priority; no deadline is required. Respect negation such as not important.',
  [PROPERTY_OPTION_IDS.PRIORITY.URGENT]:
    'Does the author explicitly mark this task urgent, request immediate action, or describe an emergency, active outage, critical blocker, or imminent deadline? A parenthetical (urgent) is sufficient. Merely saying important or high priority does not mean urgent. Respect negation such as not urgent.',
};

export function taskPredictionRequest(
  input: TaskPredictionInput
): DecisionRequest {
  // Jev accepts 32 questions and 64 KiB. Leave four slots for priority and
  // bound text by UTF-16 length so even escaped JSON stays under that limit.
  const projects = input.predictProject ? input.projects.slice(0, 28) : [];
  return {
    input: {
      title: input.title.slice(0, 500),
      description: input.description.slice(0, 4000),
      projects: projects.map(({ id, name }, index) => ({
        key: `project_${index}`,
        id,
        name: name.slice(0, 150),
      })),
    },
    questions: {
      ...(input.predictPriority ? priorityQuestions : {}),
      ...Object.fromEntries(
        projects.map((_, index) => [
          `project_${index}`,
          `Does this task concern the subject named by project_${index}? Use the ordinary meaning of each project name, including synonyms. An explicit name match is sufficient even for a short task. Ignore missing project details. Prefer the most specific named subject; exclude unrelated or explicitly ruled-out projects.`,
        ])
      ),
    },
  };
}

export function decodeTaskPredictions(
  input: TaskPredictionInput,
  probabilities: Record<string, number>
): TaskPredictions {
  const projects = input.projects.slice(0, 28);
  const projectKeys = projects.map((_, index) => `project_${index}`);
  const project = confidentPrediction(projectKeys, probabilities);
  return {
    ...(input.predictPriority
      ? {
          priority: confidentPrediction(
            Object.keys(priorityQuestions),
            probabilities
          ),
        }
      : {}),
    ...(input.predictProject
      ? {
          project: project ? projects[projectKeys.indexOf(project)].id : null,
        }
      : {}),
  };
}

export async function predictTaskProperties(input: TaskPredictionInput) {
  const result = await cognitionApiServiceClient.decisions(
    taskPredictionRequest(input)
  );
  return result.map((response) =>
    decodeTaskPredictions(input, response.probabilities)
  );
}
