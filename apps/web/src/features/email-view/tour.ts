import { VIEW_SHELL_TOUR } from '@app/components/view-shell/tour';
import { defineViewTour } from '@app/features/tours/core/view-tour';
import { defineTourTargets } from '@ui/components/Tour';

export const EMAIL_TOUR = defineTourTargets('email', [
  'signalNoise',
  'tags',
  'list',
  'search',
]);

export const emailTour = defineViewTour({
  id: 'mail',
  title: 'Email',
  connector: { kind: 'email', label: 'Google' },
  video: { youtubeId: 'tnsxkywzTvY', title: 'Macro Mail', duration: '1:24' },
  steps: [
    {
      target: EMAIL_TOUR.signalNoise,
      title: 'Move between inbox views',
      description:
        'Important keeps priority conversations in focus. Other holds lower-priority mail, and Calendar shows calendar-related messages. Press Tab or Shift+Tab in the mail list to cycle through these views.',
    },
    {
      target: EMAIL_TOUR.tags,
      entry: VIEW_SHELL_TOUR.sidebarToggle,
      entryLabel: 'Show the email sidebar to continue',
      title: 'Organize email your way',
      description:
        'Create tags for projects, customers, or anything you track. Apply them manually, ask an agent to tag matching email, or set up a routine to keep it organized. Choose a tag here to see its messages.',
    },
    {
      target: [EMAIL_TOUR.list, EMAIL_TOUR.search],
      title: 'Move faster with shortcuts',
      description:
        'Select messages and press ⌘K (Ctrl+K on Windows) to see available actions and their shortcuts. Use ⌘F / Ctrl+F to search email, and Escape to clear your selection.',
    },
  ],
});
