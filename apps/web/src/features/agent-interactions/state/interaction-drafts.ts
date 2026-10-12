import type { InteractionDraft } from '../context/interaction';

/**
 * What the user has typed into answers the agent is still waiting on, kept
 * for the conversation surfaces that show those requests live, by session
 * and request.
 *
 * Those surfaces come and go while a request stays open. A DM's typing row,
 * where its questions and drafts show, mounts only on the newest row of a
 * virtualized list and only while the agent's typing is fresh: scrolling
 * away, posting a follow-up, or backgrounding the app on a phone takes it
 * down, and a half-edited email would go with it. So the drafts live here,
 * not in the row. An answer sent from a card drops its draft; a request the
 * agent stopped waiting on leaves a few fields behind until the page
 * reloads.
 */
export const conversationDrafts = new Map<string, InteractionDraft>();
