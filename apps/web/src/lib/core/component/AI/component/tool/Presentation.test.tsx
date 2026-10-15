import { watchPresentationChanges } from '@core/pptx-engine/changes';
import { describe, expect, it, vi } from 'vitest';
import { editPresentationHandler } from './Presentation';

// The document chip pulls in the app's live clients; these tests need none.
vi.mock('@core/component/ItemPreview', () => ({ ItemPreview: () => null }));

const DOCUMENT = '019fd3b9-3c6c-7c05-89c2-a27f01218140';

describe('presentation tools', () => {
  it('announces saved edits so open editors reload', async () => {
    const reload = vi.fn();
    const other = vi.fn();
    const stop = watchPresentationChanges(DOCUMENT, reload);
    const stopOther = watchPresentationChanges('another-document', other);
    await editPresentationHandler.handleResponse?.({
      chat_id: 'chat',
      message_id: 'message',
      part_index: 0,
      isComplete: true,
      tool: {
        name: 'EditPresentation',
        id: 'tool',
        data: {
          documentId: DOCUMENT,
          created: [],
          structureChanged: false,
          changedSlides: 'Slide 1 (id 256, layout "Title Only"):',
        },
      },
    } as Parameters<
      NonNullable<typeof editPresentationHandler.handleResponse>
    >[0]);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    stop();
    stopOther();
  });
});
