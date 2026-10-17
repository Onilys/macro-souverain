import { openBulkEditModal } from '@app/features/entity/bulk-edit/BulkEditEntityModal';
import { toast } from '@core/component/Toast/Toast';
import type { EntityData } from '@entity';
import {
  canRenameNativeChannel,
  isKnownWhatsappGroup,
} from '@queries/meta-messaging';
import { restoreSoupFocus } from '../utils';
import type { EntityActionListState } from './entity-action-context';

type MakeRenameOptions = {
  userId: () => string | undefined;
};

export const makeRenameAction = (options: MakeRenameOptions) => {
  const { userId } = options;

  const canExecute = (entity: EntityData): boolean => {
    if (entity.type === 'agent_session' && entity.isArchived) return false;
    if (
      entity.type === 'email' ||
      entity.type === 'database' ||
      entity.type === 'form'
    )
      return false;
    if (entity.type === 'channel_message' || entity.type === 'channel_thread') {
      return false;
    }
    if (entity.type === 'foreign') return false;

    if (entity.type === 'channel') {
      if (
        entity.channelType === 'direct_message' ||
        isKnownWhatsappGroup(entity.id)
      )
        return false;
      return entity.isParticipant !== false;
    }

    return entity.ownerId === userId();
  };

  const mayOpen = async (entities: EntityData[]) => {
    try {
      const decisions = await Promise.all(
        entities
          .filter(
            (entity) =>
              entity.type === 'channel' && entity.channelType !== 'public'
          )
          .map((entity) => canRenameNativeChannel(entity.id))
      );
      if (decisions.some((allowed) => !allowed)) {
        toast.failure(
          'WhatsApp controls this group name. Rename it in WhatsApp.'
        );
        return false;
      }
      return true;
    } catch {
      toast.failure('Could not check channel settings. Try again.');
      return false;
    }
  };

  const execute = async (entities: EntityData[]) => {
    if (!(await mayOpen(entities))) return;
    openBulkEditModal({
      view: 'rename',
      entities,
      onFinish: () => {
        toast.success(
          entities.length > 1 ? `Renamed ${entities.length} items` : 'Renamed'
        );
      },
    });
  };

  const executeWithSoup = async (
    entities: EntityData[],
    soup: EntityActionListState
  ) => {
    if (!(await mayOpen(entities))) return;
    const firstEntity = entities[0];

    openBulkEditModal({
      view: 'rename',
      entities,
      onFinish: () => {
        toast.success(
          entities.length > 1 ? `Renamed ${entities.length} items` : 'Renamed'
        );
        if (firstEntity) {
          soup.focus.set(firstEntity.id);
        }
        restoreSoupFocus(firstEntity?.id);
      },
      onCancel: () => {
        if (firstEntity) {
          soup.focus.set(firstEntity.id);
        }
        restoreSoupFocus(firstEntity?.id);
      },
    });
  };

  return { canExecute, execute, executeWithSoup };
};
