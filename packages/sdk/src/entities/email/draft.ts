import type {
  AddDraftAttachmentRequest,
  ApiDraftInput,
} from '../../../generated/email/types.gen';
import type { MacroClient } from '../../utils/client';
import type { EmailAttachment } from './attachment';
import { EmailMessage } from './message';
import type { EmailThread } from './thread';

/** Draft content; relationships use message and thread handles. */
export type DraftOptions = Omit<
  ApiDraftInput,
  | 'db_id'
  | 'provider_id'
  | 'provider_thread_id'
  | 'replying_to_id'
  | 'thread_db_id'
  | 'body_text'
  | 'body_html'
  | 'body_macro'
  | 'headers_json'
  | 'include_signature'
> & {
  /** Plain text body. */
  bodyText?: string;
  /** HTML body. */
  bodyHtml?: string;
  /** Macro body. */
  bodyMacro?: string;
  /** Extra headers. */
  headers?: ApiDraftInput['headers_json'];
  /** Include the inbox signature. */
  includeSignature?: boolean;
  /** Thread receiving this draft. */
  thread?: EmailThread;
  /** Message being replied to. */
  replyingTo?: EmailMessage;
};

/** A draft email. Sending remains an explicit separate operation. */
export class EmailDraft extends EmailMessage {
  private async inboxHeaders() {
    return { 'X-Email-Link-Id': (await this.link()).id };
  }

  /** Construct a lazy draft handle. */
  static byId(client: MacroClient, id: string): EmailDraft {
    return new EmailDraft(client, id);
  }

  /** Replace draft content without changing its identity or sending it. */
  async update(options: DraftOptions): Promise<void> {
    const headers = await this.inboxHeaders();
    await this.mutate((c) =>
      c.email.createDraft({
        headers,
        body: { draft: { ...draftBody(options), db_id: this.id } },
      }),
    );
  }

  /** Delete the draft. */
  async delete(): Promise<void> {
    const headers = await this.inboxHeaders();
    await this.mutate((c) =>
      c.email.deleteDraft({ path: { id: this.id }, headers }),
    );
  }

  /** Schedule this draft for sending. */
  async schedule(
    sendTime: string,
    options?: { includeSignature?: boolean },
  ): Promise<void> {
    const headers = await this.inboxHeaders();
    await this.mutate((c) =>
      c.email.upsertScheduledMessage({
        path: { id: this.id },
        headers,
        body: {
          send_time: sendTime,
          include_signature: options?.includeSignature,
        },
      }),
    );
  }

  /** Remove a scheduled send. */
  async unschedule(): Promise<void> {
    const headers = await this.inboxHeaders();
    await this.mutate((c) =>
      c.email.deleteScheduledDraft({ path: { message_id: this.id }, headers }),
    );
  }

  /** Reserve an attachment upload. Upload to the returned URL, then call complete(). */
  async addAttachment(options: {
    fileName: string;
    sha: string;
    size: number;
    uploadId?: string;
  }) {
    const body: AddDraftAttachmentRequest = {
      file_name: options.fileName,
      sha: options.sha,
      size: options.size,
      upload_id: options.uploadId,
    };
    const headers = await this.inboxHeaders();
    const result = await this.mutate((c) =>
      c.email.addDraftAttachment({ path: { id: this.id }, headers, body }),
    );
    return {
      attachment: DraftAttachment.byId(this.client, this, result.attachment_id),
      uploadUrl: result.upload_url,
      contentType: result.content_type,
    };
  }

  /** Forward an existing attachment into this draft. */
  async forwardAttachment(
    attachment: EmailAttachment,
  ): Promise<DraftAttachment> {
    const headers = await this.inboxHeaders();
    const result = await this.mutate((c) =>
      c.email.addForwardedAttachment({
        path: { id: this.id },
        headers,
        body: { attachment_id: attachment.id },
      }),
    );
    return DraftAttachment.byId(this.client, this, result.attachment_id, true);
  }

  /** Remove a draft attachment. */
  async removeAttachment(attachment: DraftAttachment): Promise<void> {
    if (attachment.draft.id !== this.id)
      throw new Error('Attachment belongs to another draft');
    const headers = await this.inboxHeaders();
    if (attachment.forwarded)
      await this.mutate((c) =>
        c.email.removeForwardedAttachment({
          path: { id: this.id, attachment_id: attachment.id },
          headers,
        }),
      );
    else
      await this.mutate((c) =>
        c.email.removeDraftAttachment({
          path: { id: this.id, attachment_id: attachment.id },
          headers,
        }),
      );
  }

  /** Complete verification of an uploaded attachment. */
  async verifyAttachment(attachment: DraftAttachment): Promise<void> {
    if (attachment.draft.id !== this.id || attachment.forwarded)
      throw new Error('Expected an uploaded attachment on this draft');
    await this.completeDraftAttachment(attachment.id);
  }
}

/** An uploaded or forwarded attachment belonging to a draft. */
export class DraftAttachment {
  private constructor(
    /** Parent draft. */
    readonly draft: EmailDraft,
    /** Attachment identity. */
    readonly id: string,
    /** Whether this attachment was forwarded. */
    readonly forwarded: boolean,
  ) {}

  /** Construct a draft scoped attachment handle. */
  static byId(
    _client: MacroClient,
    draft: EmailDraft,
    id: string,
    forwarded = false,
  ): DraftAttachment {
    return new DraftAttachment(draft, id, forwarded);
  }

  /** Complete verification after uploading the file. */
  complete(): Promise<void> {
    return this.draft.verifyAttachment(this);
  }

  /** Remove this attachment from its draft. */
  remove(): Promise<void> {
    return this.draft.removeAttachment(this);
  }

  /** Serialize identity without credentials. */
  toJSON() {
    return { id: this.id, draftId: this.draft.id, forwarded: this.forwarded };
  }
}

/** Translate draft content to the generated contract. */
export function draftBody(options: DraftOptions): ApiDraftInput {
  const {
    bodyText,
    bodyHtml,
    bodyMacro,
    headers,
    includeSignature,
    thread,
    replyingTo,
    ...rest
  } = options;
  return {
    ...rest,
    body_text: bodyText,
    body_html:
      bodyHtml === undefined
        ? undefined
        : btoa(
            Array.from(new TextEncoder().encode(bodyHtml), (byte) =>
              String.fromCharCode(byte),
            ).join(''),
          )
            .replaceAll('+', '-')
            .replaceAll('/', '_')
            .replaceAll('=', ''),
    body_macro: bodyMacro,
    headers_json: headers,
    include_signature: includeSignature,
    thread_db_id: thread?.id,
    replying_to_id: replyingTo?.id,
  };
}
