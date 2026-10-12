/**
 * A send-as alias from Gmail settings, representing an email address the user
 * can send mail as. This includes the primary address as well as any configured
 * aliases.
 */
export interface SendAsAlias {
  /** The email address that appears in the "From:" header for mail sent using
   * this alias. */
  send_as_email: string;
  /** A name that appears as the sender in the "From:" header for mail sent
   * using this alias. */
  display_name: string | null;
  /** Whether this address is the primary address used to login to Gmail. */
  is_primary: boolean;
  /** Whether this address is the default "from" address for composing new
   * messages (not replies). */
  is_default: boolean;
}
