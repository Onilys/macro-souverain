import { getUploadFileSize } from '@core/mobile/nativeStagedUpload';
import {
  $createDocumentMentionNode,
  $isClassedBlockNode,
} from '@macro-inc/lexical-core';
import { Telemetry } from '@macro-inc/observability';
import {
  $addUpdateTag,
  $createParagraphNode,
  $getRoot,
  type LexicalEditor,
} from 'lexical';
import { type Accessor, createSignal } from 'solid-js';
import type {
  EmailComposeFeedback,
  EmailEditorFiles,
  UploadedDocument,
} from '../context/compose-capabilities';

/**
 * Links each document on its own line at the end of the written message,
 * above the quoted thread a reply carries, where recipients expect attachments.
 */
export function appendAttachmentLinks(
  editor: LexicalEditor,
  documents: readonly UploadedDocument[]
) {
  if (documents.length === 0) return;
  editor.update(() => {
    // Attaching from the toolbar must not pull focus into the editor.
    $addUpdateTag('skip-dom-selection');
    const root = $getRoot();
    const quote = root
      .getChildren()
      .find(
        (node) =>
          $isClassedBlockNode(node) && node.__classes.includes('macro_quote')
      );
    for (const document of documents) {
      const paragraph = $createParagraphNode().append(
        $createDocumentMentionNode({
          documentId: document.documentId,
          documentName: document.name,
          blockName: document.blockName,
        })
      );
      if (quote) quote.insertBefore(paragraph);
      else root.append(paragraph);
    }
  });
}

/**
 * Offers to share files that exceed the delivery limit as Macro links. Each
 * confirmed file is uploaded as a document, opened to anyone with the link,
 * and linked from the body, as a file dropped into the body would be. A send
 * must wait for `uploading`, and a composer that moves to another draft calls
 * `detach` so uploads still in flight link nothing.
 */
export function createAttachmentLinkOffer(options: {
  editor: Accessor<LexicalEditor | undefined>;
  notices: Pick<EmailComposeFeedback, 'confirm'>;
  editorFiles: Pick<EmailEditorFiles, 'uploadDocuments' | 'makePublic'>;
}) {
  const inFlight = new Set<Promise<UploadedDocument[]>>();
  const [uploading, setUploading] = createSignal(false);
  let generation = 0;

  const share = async (files: File[], limitBytes: number): Promise<void> => {
    if (files.length === 0) return;
    const started = generation;
    const single = files.length === 1;
    const limitLabel = `${limitBytes / 1_000_000} MB`;
    await Telemetry.span('email.attachment_links', async (span) => {
      span.setAttr('email.attachment_links.file_count', files.length);
      span.setAttr(
        'email.attachment_links.total_bytes',
        files.reduce((sum, file) => sum + getUploadFileSize(file), 0)
      );
      const confirmed = await options.notices.confirm({
        title: `Attachments exceed ${limitLabel}`,
        body: single
          ? `"${files[0].name}" won't fit as an attachment. Upload it to Macro and share a view-only link instead?`
          : `${files.length} files won't fit as attachments. Upload them to Macro and share view-only links instead?`,
        confirmLabel: single ? 'Share link' : 'Share links',
      });
      span.setAttr('email.attachment_links.confirmed', confirmed);
      // The composer may have reset while the prompt was open; nothing to
      // upload for then.
      if (!confirmed || started !== generation) {
        span.setAttr('email.attachment_links.linked', false);
        return;
      }
      const upload = span.span('email.attachment_links.upload', () =>
        options.editorFiles.uploadDocuments(files)
      );
      inFlight.add(upload);
      setUploading(true);
      let documents: UploadedDocument[];
      try {
        documents = await upload;
      } finally {
        inFlight.delete(upload);
        setUploading(inFlight.size > 0);
      }
      span.setAttr('email.attachment_links.uploaded_count', documents.length);
      // The composer moved on while the files uploaded: they stay private and
      // unlinked rather than landing in whatever is being written now.
      const current = started === generation;
      span.setAttr('email.attachment_links.linked', current);
      if (!current) return;
      for (const document of documents) {
        options.editorFiles.makePublic(document.documentId);
      }
      const editor = options.editor();
      if (editor) appendAttachmentLinks(editor, documents);
    });
  };

  return {
    share,
    uploading,
    /** Resolves once every upload in flight has settled, linked or not. */
    async settled() {
      while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
    },
    detach() {
      generation += 1;
    },
  };
}
