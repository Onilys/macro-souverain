import { FileDetailLayout } from '@app/components/entity-detail/FileEntityDetail';
import type { FileDetailContext } from '@app/components/entity-detail/file-detail-context';
import { downloadFileOperation } from '@app/components/entity-detail/file-detail-operations';
import { SpreadsheetSkeleton } from '@app/features/block-spreadsheet/components/SpreadsheetSkeleton';
import { isUploadedWorkbook } from '@app/features/block-spreadsheet/core/uploaded-workbook';
import { useSpreadsheetAccess } from '@app/features/block-spreadsheet/primitives/use-spreadsheet-access';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { UnknownContent } from '@block-unknown/component/UnknownContent';
import { getPermissions } from '@core/component/SharePermissions';
import { toast } from '@core/component/Toast/Toast';
import { useShareModal } from '@core/component/TopBar/shareModal';
import { downloadFile } from '@filesystem/download';
import { useQueryClient } from '@queries/client';
import { track } from '@queries/history/track-block-opened';
import type { JSX } from 'solid-js';
import { lazy, onMount, Show, Suspense } from 'solid-js';
import { FileDetailLoadGate } from '../components/FileDetail';
import { getFileDocumentBlob } from '../queries/file-document';
import {
  loadUnknownDocument,
  type UnknownDocumentData,
} from '../queries/unknown-document';
import { documentDownloadName } from '../util/document-download-name';

const UploadedWorkbookDocument = lazy(async () => ({
  default: (
    await import('@app/features/block-spreadsheet/views/UploadedWorkbook')
  ).UploadedWorkbookDocument,
}));
export type UnknownDetailContext = FileDetailContext<UnknownDocumentData>;

export function UnknownDetailDocument(props: {
  documentId: string;
  data: UnknownDocumentData;
  children?: (context: UnknownDetailContext) => JSX.Element;
}) {
  const spreadsheetEnabled = useSpreadsheetAccess();
  const isWorkbook = () =>
    spreadsheetEnabled() &&
    isUploadedWorkbook(props.data.documentMetadata.fileType);
  const openShare = useShareModal(() => ({
    id: props.documentId,
    blockAlias: 'unknown',
    itemType: 'document',
    name: props.data.documentMetadata.documentName,
    userPermissions: getPermissions(props.data.userAccessLevel),
    owner: props.data.documentMetadata.owner,
  }));
  const downloadName = () => documentDownloadName(props.data.documentMetadata);

  const downloadDocument = async () => {
    try {
      const file = await getFileDocumentBlob({
        documentId: props.documentId,
        documentVersionId: props.data.documentMetadata.documentVersionId,
      });
      downloadFile(file, downloadName());
    } catch (error) {
      console.error('error downloading file', error);
      toast.failure('Error downloading file');
    }
  };
  const operations = [downloadFileOperation(() => void downloadDocument())];

  return (
    <FileDetailLayout
      documentId={props.documentId}
      documentMetadata={props.data.documentMetadata}
      userAccessLevel={props.data.userAccessLevel}
      defaultSidePanelOpen={!isWorkbook()}
    >
      {props.children?.({
        data: props.data,
        documentMetadata: props.data.documentMetadata,
        userAccessLevel: props.data.userAccessLevel,
        operations,
      })}
      <Show
        when={isWorkbook()}
        fallback={
          <UnknownContent
            fileName={props.data.documentMetadata.documentName}
            onShare={openShare}
            onDownload={() => void downloadDocument()}
          />
        }
      >
        <Suspense fallback={<SpreadsheetSkeleton />}>
          <UploadedWorkbookDocument
            documentId={props.documentId}
            version={props.data.documentMetadata.documentVersionId}
            fileType={props.data.documentMetadata.fileType ?? ''}
            name={
              props.data.documentMetadata.documentName || 'Imported spreadsheet'
            }
          />
        </Suspense>
      </Show>
    </FileDetailLayout>
  );
}

export function UnknownDetail(props: {
  documentId: string;
  children?: (context: UnknownDetailContext) => JSX.Element;
}) {
  const analytics = useAnalytics();
  const client = useQueryClient();
  onMount(() => {
    track({
      itemId: props.documentId,
      blockName: 'unknown',
      client: () => client,
    });
    analytics.pageView('unknown');
    analytics.track('open_entity', {
      entityType: 'unknown',
      entityId: props.documentId,
    });
  });
  return (
    <FileDetailLoadGate
      documentId={props.documentId}
      label="file"
      load={loadUnknownDocument}
    >
      {(data) => (
        <UnknownDetailDocument
          documentId={props.documentId}
          data={data}
          children={props.children}
        />
      )}
    </FileDetailLoadGate>
  );
}
