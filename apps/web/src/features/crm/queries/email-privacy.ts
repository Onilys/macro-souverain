import { throwOnErr } from '@core/util/result';
import { soupKeys } from '@queries/soup/keys';
import type {
  CrmEmailPrivacyResponse,
  crmEmailPrivacyClient,
} from '@service-storage/crm-email-privacy';
import { useMutation, useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import type { EmailPrivacy, EmailPrivacyChange } from '../core/email-privacy';
import type { CrmQueryDependencies } from './dependencies';
import { crmKeys } from './keys';

function fromResponse(data: CrmEmailPrivacyResponse): EmailPrivacy {
  return {
    enabled: data.enabled,
    mailboxEmail: data.mailbox_email ?? null,
    teamDomains: data.team_domains,
    personalDomains: data.personal_domains,
    canRemoveTeamDomains: data.can_remove_team_domains,
  };
}

export function createEmailPrivacySource(
  deps: Pick<CrmQueryDependencies, 'client' | 'feedback'> & {
    privacy: typeof crmEmailPrivacyClient;
  },
  teamId: Accessor<string | undefined>,
  userId: Accessor<string | undefined>
) {
  const key = () => crmKeys.emailPrivacy(teamId(), userId()).queryKey;
  const query = useQuery(
    () => ({
      queryKey: key(),
      enabled: !!teamId() && !!userId(),
      queryFn: async () =>
        fromResponse(await throwOnErr(() => deps.privacy.get())),
    }),
    () => deps.client
  );
  const update = useMutation(
    () => ({
      scope: { id: 'crm-email-privacy' },
      mutationFn: async (change: EmailPrivacyChange) =>
        fromResponse(await throwOnErr(() => deps.privacy.update(change))),
      onMutate: () => ({ queryKey: key() }),
      onSuccess: async (data: EmailPrivacy, _change, context) => {
        if (context) deps.client.setQueryData(context.queryKey, data);
        await deps.client.invalidateQueries({ queryKey: soupKeys._def });
        await deps.client.invalidateQueries({ queryKey: crmKeys._def });
      },
      onError: (error: Error) =>
        deps.feedback.failure(
          error.message || 'Could not update CRM email settings'
        ),
    }),
    () => deps.client
  );
  return { query, update };
}
