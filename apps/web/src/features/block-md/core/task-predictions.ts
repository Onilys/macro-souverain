export type TaskPredictionInput = {
  title: string;
  description: string;
  projects: readonly { id: string; name: string }[];
  predictPriority: boolean;
  predictProject: boolean;
};

/** Undefined means not evaluated; null means no confident match. */
export type TaskPredictions = {
  priority?: string | null;
  project?: string | null;
};

/** Pick the highest confident score; abstain on ties, missing, or invalid scores. */
export function confidentPrediction(
  candidates: readonly string[],
  probabilities: Record<string, number>
): string | null {
  if (
    candidates.some((id) => {
      const score = probabilities[id];
      return !Number.isFinite(score) || score < 0 || score > 1;
    })
  )
    return null;
  const ranked = [...candidates].sort(
    (a, b) => probabilities[b] - probabilities[a]
  );
  const first = ranked[0];
  if (!first || probabilities[first] < 0.8) return null;
  const second = ranked[1];
  if (second && probabilities[first] === probabilities[second]) return null;
  return first;
}
