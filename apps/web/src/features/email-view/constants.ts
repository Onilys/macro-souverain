/**
 * Persisted tab ids stay compatible with the legacy mail view; labels are Important and Other.
 * Favorites extends that list; entity action capabilities use `${view}-${tab}`.
 */
export const EMAIL_TAB_IDS = [
  'important',
  'noise',
  'calendar',
  'favorites',
  'sent',
  'scheduled',
  'reminders',
  'drafts',
  'shared',
  'archived',
  'all',
] as const;

export type EmailTab = (typeof EMAIL_TAB_IDS)[number];

const EMAIL_TAB_LABELS = {
  important: 'Important',
  noise: 'Other',
  favorites: 'Favorites',
  sent: 'Sent',
  scheduled: 'Scheduled',
  reminders: 'Reminders',
  calendar: 'Calendar',
  drafts: 'Drafts',
  shared: 'Shared',
  archived: 'Archived',
  all: 'All',
} as const satisfies Record<EmailTab, string>;

export type EmailTabItem = {
  id: EmailTab;
  label: string;
};

export const EMAIL_TABS: readonly EmailTabItem[] = EMAIL_TAB_IDS.map((id) => ({
  id,
  label: EMAIL_TAB_LABELS[id],
}));

export const DEFAULT_EMAIL_TAB: EmailTab = 'important';

/** Primary inbox views, in keyboard-cycling order. */
export const EMAIL_INBOX_TAB_IDS = ['important', 'noise', 'calendar'] as const;
