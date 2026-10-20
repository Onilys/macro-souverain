import { fireAndForget } from '@core/util/fireAndForget';
import { Telemetry } from '@macro-inc/observability';
import { storageServiceClient } from '@service-storage/client';
import { queryClient } from '../client';
import { invalidatePreview } from '../preview/preview';
import { refetchSoupEntity } from '../soup/cache';
import { documentLoadKeys } from './documentLoad/keys';
import { entityKeys } from './keys';

/**
 * Turns a markdown document into a task in place, then refreshes every cache
 * that holds the document's kind so it reopens as a task.
 */
export async function convertDocumentToTask(documentId: string) {
  const span = Telemetry.span('document.convert_to_task');
  span.setAttr('document.id', documentId);
  const result = await span.run(() =>
    storageServiceClient.convertDocumentToTask({ documentId })
  );
  span.setAttr('document.outcome', result.isOk() ? 'success' : 'error');
  span.end();
  if (result.isErr()) return result;

  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: entityKeys.documentMetadata(documentId).queryKey,
    }),
    queryClient.invalidateQueries({
      queryKey: documentLoadKeys.bundle(documentId).queryKey,
    }),
    invalidatePreview(documentId),
  ]);
  fireAndForget(
    refetchSoupEntity(documentId, 'document', {
      ownTouch: true,
      refreshGraphql: true,
    }),
    'convert-document'
  );
  return result;
}
