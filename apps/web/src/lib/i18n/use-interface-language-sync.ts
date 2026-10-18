import { useUserLanguageQuery } from '@queries/auth/user-language';
import { queryReadyGate } from '@queries/gate';
import { useCurrentTeamQuery } from '@queries/team/teams';
import { createEffect } from 'solid-js';
import { setInterfaceLanguage } from './i18n';
import { resolveInterfaceLanguage } from './languages';

/**
 * Keeps the interface language in step with the account: the user's own
 * language, else their team's, else English. Until both settings have loaded
 * the language remembered on this device stays in place.
 */
export function useInterfaceLanguageSync() {
  const userLanguage = useUserLanguageQuery();
  const team = useCurrentTeamQuery();

  createEffect(() => {
    if (!queryReadyGate(userLanguage) || !queryReadyGate(team)) return;
    setInterfaceLanguage(
      resolveInterfaceLanguage(
        userLanguage.data.language,
        team.data?.team.language
      )
    );
  });
}
