import type { SendAsAlias } from './sendAsAlias';

/** The response from the list send-as aliases endpoint. */
export interface ListSendAsResponse {
  /** The list of send-as aliases for this inbox. */
  aliases: SendAsAlias[];
}
