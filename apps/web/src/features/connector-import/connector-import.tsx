import { openChatWithInput } from '@app/features/chat/ChatWithAgentButton';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { pipedreamAppAvailableInEnv } from '@core/component/AI/constant/mcpServers';
import { enableConnectorImport } from '@core/constant/featureFlags';
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
import { cn } from '@ui';
import { createSignal, type JSX, Show } from 'solid-js';
import { ImportPromoCard } from './components/import-promo-card';
import { ConnectorImportProvider } from './context/connector-import-context';
import type { ConnectorImportContext } from './context/contracts';
import { IMPORT_CATEGORIES } from './core/catalog';
import type { ImportCategory } from './core/providers';
import {
  hideImportPromotion,
  isImportPromotionHidden,
} from './primitives/promotion';
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
  alternative?: ImportAlternative;
  class?: string;
}): JSX.Element {
  const flag = useFeatureFlag(enableConnectorImport);
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
 * none available the card opens the alternative directly.
 */
export function ConnectorImportPromotion(props: {
  category: ImportCategory;
  alternative?: ImportAlternative;
  class?: string;
}): JSX.Element {
  const userId = useUserId();
  const pipedream = usePipedreamMcpFlag();
  const context = useProductionContext();
  const config = () => IMPORT_CATEGORIES[props.category];
  const dialogConfig = () => ({
    ...config(),
    providers: pipedream()
      ? config().providers.filter((provider) =>
          pipedreamAppAvailableInEnv(provider.appSlug)
        )
      : [],
  });
  const [open, setOpen] = createSignal(false);
  const [opener, setOpener] = createSignal<HTMLButtonElement>();
  const hide = () => hideImportPromotion(userId(), props.category);
  const alternative = (): ImportAlternative | undefined => {
    const base = props.alternative;
    return base && { ...base, onSelect: () => base.onSelect(opener()) };
  };

  return (
    <ConnectorImportProvider context={context}>
      <Show when={!isImportPromotionHidden(userId(), props.category)}>
        <div class={cn('shrink-0', props.class)}>
          <ImportPromoCard
            config={config()}
            onOpen={(trigger) => {
              setOpener(trigger);
              const direct = alternative();
              if (!dialogConfig().providers.length && direct) direct.onSelect();
              else setOpen(true);
            }}
            onDismiss={hide}
          />
        </div>
      </Show>
      {/* Outside the card's Show: a finished import hides the card, not the dialog. */}
      <ConnectorImportDialog
        config={dialogConfig()}
        open={open()}
        onOpenChange={setOpen}
        opener={opener()}
        alternative={alternative()}
        onImported={hide}
      />
    </ConnectorImportProvider>
  );
}
