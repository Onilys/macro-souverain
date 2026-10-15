import { openChatWithInput } from '@app/features/chat/ChatWithAgentButton';
import { SidebarPromotion } from '@app/features/sidebar-promotion/sidebar-promotion';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { enableSidebarPromotions } from '@core/constant/featureFlags';
import { useUserId } from '@core/context/user';
import { usePipedreamMcpFlag } from '@core/pipedream/flag';
import { buildSimpleEntityUrl } from '@core/util/url';
import {
  type ImportState,
  useDiscoverMutation,
  useImportQuery,
  useRunImportMutation,
} from '@queries/import';
import {
  connectPipedreamApp,
  usePipedreamConnectedSlugs,
} from '@queries/pipedream-connectors';
import { createSignal, type JSX, Show } from 'solid-js';
import { ConnectorImportProvider } from './context/connector-import-context';
import type { ConnectorImportContext } from './context/contracts';
import { IMPORT_CATEGORIES } from './core/catalog';
import type { ImportCategory } from './core/providers';
import { hideImportPromotion, importPromotionId } from './primitives/promotion';
import {
  ConnectorImportDialog,
  type ImportAlternative,
} from './views/import-dialog';

const PENDING_STATE: ImportState = { runs: [], entities: [] };

function useProductionContext(): ConnectorImportContext {
  const discover = useDiscoverMutation();
  const runImport = useRunImportMutation();
  return {
    createConnections() {
      const { slugs, ready } = usePipedreamConnectedSlugs();
      return { connected: slugs, ready };
    },
    createImportState() {
      const query = useImportQuery();
      return {
        // Guard resource reads so polling never suspends the dialog.
        state: () => (query.isSuccess ? query.data : PENDING_STATE),
        ready: () => query.isSuccess && !query.isPlaceholderData,
      };
    },
    connect: (app, container) =>
      connectPipedreamApp({
        appSlug: app.appSlug,
        serverName: app.name,
        container,
      }),
    discover: (source) => discover.mutateAsync(source),
    runImport: async (importIds) => {
      await runImport.mutateAsync({ importIds, discardIds: [] });
    },
    startAgentImport: (handoff) =>
      openChatWithInput(handoff.input, { instructions: handoff.instructions }),
    entityHref: (entity) => buildSimpleEntityUrl(entity),
  };
}

/**
 * A view sidebar's prompt to import this category from other apps, and the
 * dialog it opens. Renders nothing until connector import is rolled out to
 * the user and the Pipedream connector stack is on.
 */
export function ConnectorImportSidebar(props: {
  category: ImportCategory;
  alternatives?: readonly ImportAlternative[];
  class?: string;
}): JSX.Element {
  const flag = useFeatureFlag(enableSidebarPromotions);
  const pipedream = usePipedreamMcpFlag();
  return (
    <Show when={flag().enabled && pipedream()}>
      <ConnectorImportPromotion {...props} />
    </Show>
  );
}

/**
 * The card and dialog without the connector-import rollout gate, for hosts
 * that gate on their own flag. Connector rows need the Pipedream stack; with
 * none available and a single alternative, the card opens it directly.
 */
export function ConnectorImportPromotion(props: {
  category: ImportCategory;
  alternatives?: readonly ImportAlternative[];
  class?: string;
}): JSX.Element {
  const userId = useUserId();
  const pipedream = usePipedreamMcpFlag();
  const context = useProductionContext();
  const config = () => IMPORT_CATEGORIES[props.category];
  const dialogConfig = () => ({
    ...config(),
    providers: pipedream() ? config().providers : [],
  });
  const [open, setOpen] = createSignal(false);
  const [opener, setOpener] = createSignal<HTMLButtonElement>();
  const hide = () => hideImportPromotion(userId(), props.category);
  // Alternatives open their own dialogs; hand them the card button for focus.
  const alternatives = (): ImportAlternative[] =>
    (props.alternatives ?? []).map((base) => ({
      ...base,
      onSelect: () => base.onSelect(opener()),
    }));

  return (
    <ConnectorImportProvider context={context}>
      <SidebarPromotion
        id={importPromotionId(props.category)}
        logos={config().providers}
        headline={config().headline}
        pitch={config().pitch}
        class={props.class}
        action={{
          label: config().action,
          onClick: (trigger) => {
            setOpener(trigger);
            const [direct, ...others] = alternatives();
            if (!dialogConfig().providers.length && direct && !others.length)
              direct.onSelect();
            else setOpen(true);
          },
        }}
      />
      {/* Beside the card: a finished import hides the card, not the dialog. */}
      <ConnectorImportDialog
        config={dialogConfig()}
        open={open()}
        onOpenChange={setOpen}
        opener={opener()}
        alternatives={alternatives()}
        onImported={hide}
      />
    </ConnectorImportProvider>
  );
}
