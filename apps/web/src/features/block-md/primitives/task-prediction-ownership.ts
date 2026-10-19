import { createSignal } from 'solid-js';

/** Explicit values (including empty selections) belong to the user. */
export function createTaskPredictionOwnership(
  initialPropertyIds: string[],
  initialPredictedIds: string[] = []
) {
  const [predictedIds, setPredictedIds] = createSignal(initialPredictedIds);
  const [manualIds, setManualIds] = createSignal(
    initialPropertyIds.filter((id) => !initialPredictedIds.includes(id))
  );
  return {
    predictedIds,
    canPredict: (id: string) => !manualIds().includes(id),
    markManual(id: string) {
      setManualIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
      setPredictedIds((ids) => ids.filter((value) => value !== id));
    },
    markPredicted(id: string) {
      setPredictedIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    },
    reset(propertyIds: string[]) {
      setManualIds(propertyIds);
      setPredictedIds([]);
    },
  };
}
