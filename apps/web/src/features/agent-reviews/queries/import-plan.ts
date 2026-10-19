import type { ImportEntity, NotionImportReport } from '@queries/import';
import { z } from 'zod';
import type {
  ImportDraft,
  ImportPlanEntry,
  ImportProgress,
} from '../core/import-plan';

const importDraftSchema = z.object({
  source: z.literal('notion'),
  excluded: z.array(z.string()).optional(),
});

/** The saved draft of an import review; `undefined` when it is not one. */
export function decodeImportDraft(draft: unknown): ImportDraft | undefined {
  const parsed = importDraftSchema.safeParse(draft);
  if (!parsed.success) return undefined;
  return { source: 'notion', excluded: parsed.data.excluded ?? [] };
}

const planMetadataSchema = z.object({
  title: z.string(),
  plan: z.object({
    decision: z.enum(['copy', 'tasks', 'skip', 'hand']),
    reason: z.string().nullish(),
    rows: z.number().nullish(),
    moreRows: z.boolean().optional(),
  }),
});

/** The Notion plan rows presented by one review, in ledger order. */
export function decodePlanEntries(
  entities: ImportEntity[],
  reviewId: string
): ImportPlanEntry[] {
  return entities.flatMap((entity): ImportPlanEntry[] => {
    if (entity.source !== 'notion' || entity.review_id !== reviewId) return [];
    const metadata = planMetadataSchema.safeParse(entity.metadata);
    if (!metadata.success) return [];
    const plan = metadata.data.plan;
    return [
      {
        id: entity.id,
        parentId: entity.parent_id ?? null,
        kind: entity.kind === 'data_source' ? 'database' : 'page',
        title: metadata.data.title,
        decision: plan.decision,
        reason: plan.reason ?? null,
        rows: plan.rows ?? null,
        moreRows: plan.moreRows ?? false,
        status: entity.status,
        error: entity.last_error ?? null,
      },
    ];
  });
}

export function decodeImportProgress(
  report: NotionImportReport
): ImportProgress {
  return {
    reviewId: report.reviewId ?? null,
    status: report.status ?? null,
    error: report.error ?? null,
    counts: {
      pages: report.pages,
      databases: report.dataSources,
      copy: report.copy,
      tasks: report.tasks,
      skip: report.skip,
      hand: report.hand,
    },
    imported: report.imported,
    waiting: report.waiting,
    writing: report.writing,
    failures: (report.failures ?? []).map((item) => ({
      id: item.importId,
      title: item.title,
      reason: item.reason ?? '',
    })),
  };
}
