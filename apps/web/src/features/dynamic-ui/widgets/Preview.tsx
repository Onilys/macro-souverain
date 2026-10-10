import { ReferenceCard } from '@app/features/agent-cards/components/reference-card';
import { useItemPreviewData } from '@core/component/ItemPreview';
import { DocumentCard } from '@core/component/LexicalMarkdown/component/decorator/DocumentCard';
import { itemToBlockName } from '@core/constant/allBlocks';
import { isAccessiblePreviewItem } from '@queries/preview/types';
import { Show } from 'solid-js';
import type { WidgetOf } from '../schema';

export type PreviewProps = Omit<WidgetOf<'preview'>, 'type'>;

/**
 * A live look inside one document: the same embed a document shows when
 * another is placed in it, rendered from the document with the viewer's own
 * access. Until it loads, and for a viewer who cannot open it, it is the
 * document's reference card instead, which says why.
 */
export function Preview(props: PreviewProps) {
  const data = useItemPreviewData(() => ({
    id: props.item.id,
    type: 'document',
  }));
  const doc = () => {
    const item = data.item();
    return isAccessiblePreviewItem(item) ? item : undefined;
  };
  return (
    <Show
      when={doc()}
      fallback={<ReferenceCard type="document" id={props.item.id} />}
    >
      {(item) => (
        <div class="w-full max-w-2xl min-w-0" data-agent-card="preview">
          <DocumentCard
            documentId={item().id}
            documentName={data.name()}
            blockName={itemToBlockName(item())}
            key={`agent-preview:${item().id}`}
            theme={{}}
          />
        </div>
      )}
    </Show>
  );
}
