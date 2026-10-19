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
    'Is this task low priority, optional, or explicitly not time sensitive?',
  [PROPERTY_OPTION_IDS.PRIORITY.MEDIUM]:
    'Is this task explicitly normal or medium priority, routine work without urgency?',
  [PROPERTY_OPTION_IDS.PRIORITY.HIGH]:
    'Is this task high priority or important to complete soon, but not an immediate emergency?',
  [PROPERTY_OPTION_IDS.PRIORITY.URGENT]:
    'Is this task urgent, requiring immediate action for an emergency, outage, critical blocker, or imminent deadline?',
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
          `Does the task clearly belong to the project with key project_${index} in the supplied projects, based on its title and description? Answer no if the relationship is unclear.`,
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
