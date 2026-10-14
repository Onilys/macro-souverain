//! SendEmail tool for composing and sending an email in one step.

use crate::domain::{
    models::{ContactInfo, CreateDraftInput},
    ports::{EmailService, GmailTokenProvider},
};
use ai_toolset::{AsyncTool, RequestContext, ServiceContext, ToolCallError, ToolResult};
use ai_toolset::{ToolAnnotated, ToolAnnotations};
use async_trait::async_trait;
use entity_access::domain::ports::EntityAccessService;
use macro_user_id::user_id::MacroUserIdStr;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::EmailToolContext;

/// A Macro entity to attach to an email, as the user would have @-mentioned it.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EmailAttachmentRef {
    /// The entity's ID.
    pub entity_id: String,
    /// The entity's type.
    #[schemars(
        description = "The kind of entity. Only things that are already files can be attached: `document` (an uploaded PDF, image, Word file, deck or design, or a Macro markdown document, which is attached as .md) and `static_file`. Macro spreadsheets and canvases, and non-file things like chats, channels, email threads, calendar events and tasks, have no file to send - describe or link those in the body instead."
    )]
    pub entity_type: String,
    /// Display label for the review card. Never the name the recipient sees.
    #[serde(default)]
    #[schemars(
        description = "The entity's name as you know it, for the review card to show the user before they send. Display only - the file the recipient receives is named from the entity itself, so a wrong or missing value here cannot mislabel the attachment."
    )]
    pub name: Option<String>,
}

/// A recipient for an email.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EmailRecipient {
    /// The recipient's email address.
    pub email: String,
    /// The recipient's display name (optional).
    #[serde(default)]
    pub name: Option<String>,
}

impl From<EmailRecipient> for ContactInfo {
    fn from(r: EmailRecipient) -> Self {
        ContactInfo {
            email: r.email,
            name: r.name,
            photo_url: None,
        }
    }
}

/// Compose and send an email. Creates a draft and immediately queues it for delivery.
#[derive(Debug, Deserialize, JsonSchema, Clone)]
#[schemars(
    title = "SendEmail",
    description = "Draft, compose, and send an email the user confirms in a review card or composer. Use this tool whenever the user asks you to draft, write, compose, or send an email (or reply to one) from the agent session view or from chat — never write the email as plain text there. It opens the draft for the user to review, edit, and confirm before it is sent, so it is the correct tool even when the user only wants a draft. Do NOT use it for a prompt that came from a channel or document thread — the context block names a conversation parent when it did, and there is no surface to review a draft in: write the email out in your reply, ask whether to send it, and use SendConfirmedEmail once the user approves. To reply to an existing message, provide the replying_to_id. Write the body in Markdown — use **bold**, *italics*, lists, links, and other standard Markdown formatting. The draft composer renders the Markdown for the user to review and edit; the composer produces HTML that is sent as the actual email body."
)]
#[serde(rename_all = "camelCase")]
pub struct SendEmail {
    /// The subject line of the email.
    pub subject: String,
    /// The body of the email, written as Markdown. A host with a composer
    /// (chat) replaces this with the base64url-encoded HTML the composer
    /// exported before the tool runs; a host without one (an agent session)
    /// leaves the Markdown, and this tool renders it the same way.
    pub body: String,
    /// The primary recipients (To field).
    pub to: Vec<EmailRecipient>,
    /// Carbon copy recipients (optional).
    #[serde(default)]
    pub cc: Vec<EmailRecipient>,
    /// Blind carbon copy recipients (optional).
    #[serde(default)]
    pub bcc: Vec<EmailRecipient>,
    /// The ID of a message to reply to (optional). When set, the email is
    /// sent as a reply within the same thread.
    #[serde(default)]
    pub replying_to_id: Option<Uuid>,
    /// Per-message signature override, set by the composer's signature preview —
    /// not normally by you. Omit to use the inbox's default policy (always on a
    /// new email; on replies/forwards only when the user enabled it). `false`
    /// excludes the signature for this one email.
    #[serde(default)]
    pub include_signature: Option<bool>,
    /// Macro entities to attach as files (optional).
    #[serde(default)]
    #[schemars(
        description = "Macro entities to send as file attachments, in order. Use this whenever the user asks for something they referenced to be attached, sent, or included - do not claim a file is attached unless it is listed here. Each entry is attached as a real file: an uploaded document keeps its own bytes and name, and a Macro markdown document is exported as .md. Attaching is all-or-nothing - if any entry cannot be turned into a file the tool fails without sending, and you must tell the user which one and why rather than quietly sending the email without it. Combined attachments must stay under 18MB."
    )]
    pub attachments: Vec<EmailAttachmentRef>,
}

/// Response from the SendEmail tool.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum SendEmailResponse {
    Sent {
        /// The database ID of the sent message.
        message_id: Uuid,
        /// The thread ID the message belongs to.
        thread_id: Uuid,
    },
    ConvertedToDraft {
        draft_id: Uuid,
    },
    UserEdited,
}

impl ToolAnnotated for SendEmail {
    const ANNOTATIONS: ToolAnnotations =
        ToolAnnotations::destructive("Send email").with_open_world();
}

#[async_trait]
impl<T, G, E> AsyncTool<EmailToolContext<T, G, E>> for SendEmail
where
    T: EmailService,
    G: GmailTokenProvider,
    E: EntityAccessService,
{
    type Output = SendEmailResponse;

    #[tracing::instrument(skip_all, fields(
        user_id=?request_context.user_id,
        subject=%self.subject,
        to_count=%self.to.len(),
    ), err)]
    async fn call(
        &self,
        service_context: ServiceContext<EmailToolContext<T, G, E>>,
        request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        let acting_user = MacroUserIdStr((*request_context.user_id).clone());
        let link = service_context.resolve_link(acting_user.clone()).await?;

        let body = service_context.render_body(&self.body).await?;

        // Resolve before anything is written: a reference that cannot become a
        // file must fail the call, not produce an email that silently omits
        // what the user asked for.
        let files = service_context
            .resolve_attachment_files(acting_user.clone(), &self.attachments)
            .await?;

        let input = CreateDraftInput {
            db_id: None,
            provider_id: None,
            replying_to_id: self.replying_to_id,
            provider_thread_id: None,
            thread_db_id: None,
            subject: self.subject.clone(),
            to: self.to.iter().cloned().map(ContactInfo::from).collect(),
            cc: self.cc.iter().cloned().map(ContactInfo::from).collect(),
            bcc: self.bcc.iter().cloned().map(ContactInfo::from).collect(),
            body_text: body.text,
            body_html: Some(body.html),
            body_macro: None,
            headers_json: None,
            send_time: None,
            // Composer override when present; otherwise None lets the backend
            // apply the default signature policy.
            include_signature: self.include_signature,
            actor: Some(acting_user),
            draft_client_binding: None,
            thread_client_binding: None,
        };

        // With no attachments this is the one-step send it has always been.
        // With them, the draft has to exist before a file can be hung off it,
        // so the send becomes draft -> attach -> send on the same row. If
        // either later step fails the draft survives as a draft and nothing
        // is delivered, which is the failure the user can act on.
        let input = if files.is_empty() {
            input
        } else {
            let draft = service_context
                .service
                .create_draft(&link, std::slice::from_ref(&link), input.clone())
                .await
                .map_err(|e| ToolCallError {
                    description: format!("Failed to prepare the email: {e}"),
                    internal_error: e.into(),
                })?;

            service_context
                .attach_files(link.id, draft.db_id, files)
                .await?;

            CreateDraftInput {
                db_id: Some(draft.db_id),
                thread_db_id: draft.thread_db_id.into(),
                ..input
            }
        };

        let sent = service_context
            .service
            .send_message(&link, std::slice::from_ref(&link), input)
            .await
            .map_err(|e| ToolCallError {
                description: format!("Failed to send email: {e}"),
                internal_error: e.into(),
            })?;

        Ok(SendEmailResponse::Sent {
            message_id: sent.db_id,
            thread_id: sent.thread_db_id,
        })
    }
}
