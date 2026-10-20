import { PROPERTY_OPTION_IDS } from '@property/identifiers';
import { expect, it, vi } from 'vitest';

vi.mock('@service-cognition/client', () => ({ cognitionApiServiceClient: {} }));

import { confidentPrediction } from '../core/task-predictions';
import {
  decodeTaskPredictions,
  taskPredictionRequest,
} from './task-predictions';

it('selects the highest score without a lead requirement and abstains on ties or invalid scores', () => {
  expect(confidentPrediction(['a', 'b'], { a: 0.9, b: 0.1 })).toBe('a');
  expect(confidentPrediction(['a', 'b'], { a: 0.9, b: 0.89 })).toBe('a');
  expect(confidentPrediction(['a', 'b'], { a: 0.79, b: 0.8 })).toBe('b');
  expect(confidentPrediction(['a', 'b'], { a: 0.9, b: 0.9 })).toBeNull();
  expect(confidentPrediction(['a'], { a: 0.79 })).toBeNull();
  expect(confidentPrediction(['a', 'b'], { a: 0.9 })).toBeNull();
  expect(confidentPrediction(['a'], { a: 1.1 })).toBeNull();
  expect(confidentPrediction(['a'], { a: NaN })).toBeNull();
});

it('updates priority and project even when each winner has a narrow lead', () => {
  const input = {
    title: 'kill all ui (important)',
    description: '',
    projects: [
      { id: 'ui', name: 'UI' },
      { id: 'design', name: 'Design' },
    ],
    predictPriority: true,
    predictProject: true,
  };
  expect(
    decodeTaskPredictions(input, {
      [PROPERTY_OPTION_IDS.PRIORITY.LOW]: 0.02,
      [PROPERTY_OPTION_IDS.PRIORITY.MEDIUM]: 0.1,
      [PROPERTY_OPTION_IDS.PRIORITY.HIGH]: 0.9,
      [PROPERTY_OPTION_IDS.PRIORITY.URGENT]: 0.89,
      project_0: 0.85,
      project_1: 0.84,
    })
  ).toEqual({ priority: PROPERTY_OPTION_IDS.PRIORITY.HIGH, project: 'ui' });
});

it('bounds requests and selects only supplied project and priority IDs', () => {
  const input = {
    title: '\u0000'.repeat(1000),
    description: '\u0000'.repeat(10000),
    projects: Array.from({ length: 100 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      name: '\u0000'.repeat(1000),
    })),
    predictPriority: true,
    predictProject: true,
  };
  const request = taskPredictionRequest(input);
  expect(Object.keys(request.questions)).toHaveLength(32);
  expect(
    Object.values(request.questions).every((question) => question.length <= 500)
  ).toBe(true);
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
    project: '00000000-0000-4000-8000-000000000002',
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
