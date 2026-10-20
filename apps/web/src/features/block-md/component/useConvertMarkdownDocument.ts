import { projectRouteId } from '@app/features/projects/core/route';
import { convertDocumentToProject } from '@app/features/projects/projects';
import { useSplitPanel } from '@components/app/split-layout/layoutUtils';
import { editorStateAsMarkdown } from '@core/component/LexicalMarkdown/utils';
import { toast } from '@core/component/Toast/Toast';
import { convertDocumentToTask } from '@queries/storage/convert-document';
import { createCallback } from '@solid-primitives/rootless';
import { useMarkdownDocument } from '../context/markdown-document-context';

/**
 * Change what a markdown document is without copying it: a task keeps the
 * document's id and content; a project takes its name and body, and the
 * document goes to trash. The split shows the result in place.
 */
export function useConvertMarkdownDocument() {
  const { documentId, persistedName, fallbackName, state } =
    useMarkdownDocument();
  const panel = useSplitPanel();

  const toTask = createCallback(async () => {
    const id = documentId();
    const result = await convertDocumentToTask(id);
    if (result.isErr()) {
      toast.failure('Failed to convert to task');
      return;
    }
    toast.success('Converted to task');
    panel?.handle.replace({ next: { type: 'task', id }, mergeHistory: true });
  });

  const toProject = createCallback(async () => {
    const editor = state.editor.md.editor;
    if (!editor) return;
    const result = await convertDocumentToProject({
      id: documentId(),
      name: persistedName() || fallbackName() || 'Untitled project',
      markdown: editorStateAsMarkdown(editor, 'internal'),
    });
    if (result.isErr()) {
      toast.failure('Failed to convert to project');
      return;
    }
    const { projectId, documentTrashed } = result.value;
    if (documentTrashed) toast.success('Converted to project');
    else
      toast.failure(
        'Project created, but the document could not be moved to trash'
      );
    panel?.handle.replace({
      next: {
        type: 'component',
        id: projectRouteId({ id: projectId, section: 'overview' }),
      },
      mergeHistory: true,
    });
  });

  return { toTask, toProject };
}
