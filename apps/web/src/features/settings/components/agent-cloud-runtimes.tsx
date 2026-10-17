import { useClaudeAgentsAccess } from '@core/claude/flag';
import { useCodexAgentsAccess } from '@core/codex/flag';
import { Show } from 'solid-js';
import { ClaudeConnection } from '../../claude-connection/claude-connection';
import { CodexHarness } from '../codex/views/CodexHarness';
import { SettingsCard } from '../primitives';

/** Claude and Codex connection cards on the Agents page. */
export function AgentCloudRuntimes() {
  const canUseClaude = useClaudeAgentsAccess();
  const canUseCodex = useCodexAgentsAccess();

  return (
    <Show when={canUseClaude() || canUseCodex()}>
      <SettingsCard>
        <Show when={canUseClaude()}>
          <ClaudeConnection />
        </Show>
        <Show when={canUseCodex()}>
          <CodexHarness />
        </Show>
      </SettingsCard>
    </Show>
  );
}
