import { fireAndForget } from '@core/util/fireAndForget';
import { Telemetry } from '@macro-inc/observability';
import { refetchSoupEntity } from '@queries/soup/cache';
import type { initiativeClient } from '@service-storage/initiative';
import { err, ok, type Result } from 'neverthrow';

export type DocumentToConvert = {
  id: string;
  name: string;
  /** The document body, which becomes the project description. */
  markdown: string;
};

export type ConvertedDocument = {
  projectId: string;
  /** False when the project exists but the document could not be trashed. */
  documentTrashed: boolean;
};

/**
 * Makes a document a project: the project takes the document's name and body
 * as its description, then the document goes to trash so one item remains.
 * The project starts unshared, so a private document's content stays private.
 * A failed create leaves the document untouched.
 */
export async function convertDocumentToProject(
  client: Pick<typeof initiativeClient, 'create'>,
  trashDocument: (documentId: string) => Promise<boolean>,
  document: DocumentToConvert
): Promise<Result<ConvertedDocument, { kind: 'create-failed' }>> {
  const span = Telemetry.span('document.convert_to_project');
  span.setAttr('document.id', document.id);
  const created = await span.run(() =>
    client.create({
      name: document.name,
      description: document.markdown.trim() || undefined,
      shareWithTeam: false,
    })
  );
  if (created.isErr()) {
    span.setAttr('document.outcome', 'create-failed');
    span.end();
    return err({ kind: 'create-failed' });
  }
  const projectId = created.value.id;
  span.setAttr('project.id', projectId);
  const documentTrashed = await span.run(() => trashDocument(document.id));
  span.setAttr(
    'document.outcome',
    documentTrashed ? 'success' : 'trash-failed'
  );
  span.end();
  fireAndForget(
    refetchSoupEntity(projectId, 'initiative', {
      ownTouch: true,
      refreshGraphql: true,
    }),
    'projects'
  );
  return ok({ projectId, documentTrashed });
}
