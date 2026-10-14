import { FileDetailLayout } from '@app/components/entity-detail/FileEntityDetail';
import type { FileDetailContext } from '@app/components/entity-detail/file-detail-context';
import { downloadFileOperation } from '@app/components/entity-detail/file-detail-operations';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { VideoContent } from '@block-video/component/VideoContent';
import { useQueryClient } from '@queries/client';
import { track } from '@queries/history/track-block-opened';
import type { JSX } from 'solid-js';
import { onMount } from 'solid-js';
import { FileDetailLoadGate } from '../components/FileDetail';
import { getFileDocumentBlob } from '../queries/file-document';
import {
  loadVideoDocument,
  type VideoDocumentData,
} from '../queries/video-document';
import { documentDownloadName } from '../util/document-download-name';
import { downloadWithProgress } from '../util/download-with-progress';

export type VideoDetailContext = FileDetailContext<VideoDocumentData>;

export function VideoDetailDocument(props: {
  documentId: string;
  data: VideoDocumentData;
  children?: (context: VideoDetailContext) => JSX.Element;
}) {
  const operations = [
    downloadFileOperation(() => {
      const fileName = documentDownloadName(props.data.documentMetadata);
      void downloadWithProgress(fileName, (onProgress) =>
        getFileDocumentBlob(
          {
            documentId: props.documentId,
            documentVersionId: props.data.documentMetadata.documentVersionId,
          },
          { onProgress }
        )
      );
    }),
  ];

  return (
    <FileDetailLayout
      documentId={props.documentId}
      documentMetadata={props.data.documentMetadata}
      userAccessLevel={props.data.userAccessLevel}
      defaultSidePanelOpen
    >
      {props.children?.({
        data: props.data,
        documentMetadata: props.data.documentMetadata,
        userAccessLevel: props.data.userAccessLevel,
        operations,
      })}
      <VideoContent
        videoUrl={props.data.videoUrl}
        fileType={props.data.documentMetadata.fileType}
        notifyUnsupported
      />
    </FileDetailLayout>
  );
}

export function VideoDetail(props: {
  documentId: string;
  children?: (context: VideoDetailContext) => JSX.Element;
}) {
  const analytics = useAnalytics();
  const client = useQueryClient();
  onMount(() => {
    track({
      itemId: props.documentId,
      blockName: 'video',
      client: () => client,
    });
    analytics.pageView('video');
    analytics.track('open_entity', {
      entityType: 'video',
      entityId: props.documentId,
    });
  });
  return (
    <FileDetailLoadGate
      documentId={props.documentId}
      label="video"
      load={loadVideoDocument}
    >
      {(data) => (
        <VideoDetailDocument
          documentId={props.documentId}
          data={data}
          children={props.children}
        />
      )}
    </FileDetailLoadGate>
  );
}
