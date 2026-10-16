import { storageServiceClient } from '@service-storage/client';
import {
  DESMOS_MIME,
  type GraphDocument,
  serializeDesmosDocument,
} from '../core/document';

export async function saveDesmosDocument(
  documentId: string,
  document: GraphDocument
): Promise<{ file: Blob; saved: boolean }> {
  const file = new Blob([serializeDesmosDocument(document)], {
    type: DESMOS_MIME,
  });
  const result = await storageServiceClient.simpleSave({
    documentId,
    file,
  });
  return { file, saved: result.isOk() };
}
