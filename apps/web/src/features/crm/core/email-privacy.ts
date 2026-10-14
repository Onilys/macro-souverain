export type EmailPrivacy = {
  enabled: boolean;
  mailboxEmail: string | null;
  teamDomains: string[];
  personalDomains: string[];
  canRemoveTeamDomains: boolean;
};

export type EmailBlockScope = 'team' | 'personal';
export type EmailPrivacyChange =
  | { action: 'set_consent'; enabled: boolean }
  | {
      action: 'add_domain' | 'remove_domain';
      scope: EmailBlockScope;
      domain: string;
    };
