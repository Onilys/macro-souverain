import { PROPERTY_OPTION_IDS } from '@property/identifiers';
import { expect, it, vi } from 'vitest';

vi.mock('@service-cognition/client', () => ({ cognitionApiServiceClient: {} }));

import { confidentPrediction } from '../core/task-predictions';
import {
  decodeTaskPredictions,
  taskPredictionRequest,
} from './task-predictions';

it('abstains on ambiguity, missing scores, and non-probabilities', () => {
  expect(confidentPrediction(['a', 'b'], { a: 0.9, b: 0.1 })).toBe('a');
  expect(confidentPrediction(['a', 'b'], { a: 0.9, b: 0.8 })).toBeNull();
  expect(confidentPrediction(['a'], { a: 0.79 })).toBeNull();
  expect(confidentPrediction(['a', 'b'], { a: 0.9 })).toBeNull();
  expect(confidentPrediction(['a'], { a: 1.1 })).toBeNull();
  expect(confidentPrediction(['a'], { a: NaN })).toBeNull();
});

it('bounds requests and selects only supplied project and priority IDs', () => {
  const input = {
    title: '\u0000'.repeat(1000),
    description: '\u0000'.repeat(10000),
    projects: Array.from({ length: 100 }, (_, i) => ({
      id: `project-${i}`,
      name: '\u0000'.repeat(1000),
    })),
    predictPriority: true,
    predictProject: true,
  };
  const request = taskPredictionRequest(input);
  expect(Object.keys(request.questions)).toHaveLength(32);
  expect(
    new TextEncoder().encode(JSON.stringify(request)).byteLength
  ).toBeLessThan(65536);
  const probabilities = Object.fromEntries(
    Object.keys(request.questions).map((key) => [key, 0.01])
  );
  probabilities.project_2 = 0.99;
  probabilities[PROPERTY_OPTION_IDS.PRIORITY.HIGH] = 0.95;
  probabilities.arbitrary_project = 1;
  expect(decodeTaskPredictions(input, probabilities)).toEqual({
    project: 'project-2',
    priority: PROPERTY_OPTION_IDS.PRIORITY.HIGH,
  });
});

it('does not ask about or return manually controlled properties', () => {
  const input = {
    title: 'Fix login',
    description: '',
    projects: [],
    predictPriority: true,
    predictProject: false,
  };
  expect(Object.keys(taskPredictionRequest(input).questions)).toHaveLength(4);
  expect(decodeTaskPredictions(input, {})).toEqual({ priority: null });
});
