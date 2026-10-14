import { toast } from '@core/component/Toast/Toast';
import type { CrmCompanyEntity } from '@entity';
import { Button, InlineCheckbox } from '@ui';
import { createSignal, Show } from 'solid-js';
import { useCrmContext } from '../context/crm-context';
import { CrmEmailPrivacyDialog } from './email-privacy';
import { useIsTeamAdmin, useSetCompanyHiddenMutation } from './use-crm';

export function CompanySharingSection(props: {
  company?: CrmCompanyEntity;
  onHidden?: () => void;
}) {
  const hideMutation = useSetCompanyHiddenMutation();
  const [privacyOpen, setPrivacyOpen] = createSignal(false);
  const { showCompanies } = useCrmContext().createNavigation();
  const isTeamAdmin = useIsTeamAdmin();

  const handleToggleShare = async (
    company: CrmCompanyEntity,
    nextShared: boolean
  ) => {
    const willHide = !nextShared;
    try {
      await hideMutation.mutateAsync({
        companyId: company.id,
        hidden: willHide,
      });
      // On hide (un-share), drop the user back to the companies list and toast.
      // Un-hide leaves them on the block.
      if (willHide) {
        toast.success('Company hidden.');
        if (props.onHidden) props.onHidden();
        else showCompanies();
      }
    } catch (error) {
      console.error('failed to update company sharing', error);
      toast.failure('Could not update company visibility');
    }
  };

  return (
    <Show
      when={props.company}
      fallback={<div class="text-xs text-ink-muted">Loading…</div>}
    >
      {(company) => {
        const isShared = () => !company().hidden;
        const shareDisabled = () => hideMutation.isPending || !isTeamAdmin();

        return (
          <div class="flex flex-col gap-4 text-xs">
            {/* Admin/owner-only: if a non-admin can see the company at all,
                it's already visible to them. */}
            <Show when={isTeamAdmin()}>
              <div class="flex flex-col gap-2">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isShared()}
                  disabled={shareDisabled()}
                  onClick={() => void handleToggleShare(company(), !isShared())}
                  class="inline-flex items-center gap-2 rounded-md h-7 px-2.5 text-xs select-none w-fit border border-ink-muted/[0.08] bg-ink-muted/[0.025] text-ink hover:bg-ink-muted/[0.06]"
                >
                  <InlineCheckbox checked={isShared()} />
                  <span class="whitespace-nowrap">Visible in CRM</span>
                </button>
                <p class="text-ink-muted leading-5">
                  Shows this company in your team's CRM lists and search. Hide
                  companies that aren't relevant to your team's CRM.
                </p>
              </div>
            </Show>

            <div class="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                class="w-fit"
                onClick={() => setPrivacyOpen(true)}
              >
                Email sharing settings
              </Button>
              <p class="text-ink-muted leading-5">
                Email sharing follows each teammate’s consent and the team and
                personal blacklists. Blocking emails keeps this company visible.
              </p>
              <CrmEmailPrivacyDialog
                open={privacyOpen()}
                onOpenChange={setPrivacyOpen}
              />
            </div>
          </div>
        );
      }}
    </Show>
  );
}
