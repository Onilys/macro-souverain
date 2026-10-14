//! Toolset inbound adapter for the Email service.

mod get_thread;
mod list_inboxes;
mod list_labels;
mod send_confirmed_email;
mod send_email;
mod set_sender_policy;
mod update_thread_labels;

#[cfg(test)]
mod test;

use crate::domain::{
    models::{Link, MAX_RAW_ATTACHMENTS_SIZE_BYTES, NewDraftAttachment},
    ports::{DraftAttachmentStore, EmailService, GmailTokenProvider},
};
use ai_toolset::{AsyncToolCollection, ToolCallError};
use attachment::EntityFileService;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use entity_access::domain::ports::EntityAccessService;
use macro_user_id::user_id::MacroUserIdStr;
use model_entity::EntityType;
use std::str::FromStr;
use std::sync::Arc;

pub use get_thread::{GetThread, GetThreadResponse};
pub use list_inboxes::{ListInboxes, ListInboxesResponse, ToolInbox};
pub use list_labels::{ListLabels, ListLabelsResponse, ToolLabel};
pub use send_confirmed_email::SendConfirmedEmail;
pub use send_email::{EmailAttachmentRef, SendEmail, SendEmailResponse};
pub use set_sender_policy::{SetSenderPolicy, SetSenderPolicyResponse, ToolSenderPolicy};
pub use update_thread_labels::{UpdateThreadLabels, UpdateThreadLabelsResponse};

/// The caller's default inbox: the primary link they own. Falls back to any
/// link they own, then any accessible inbox. `caller_macro_id` is the caller's
/// own macro id (e.g. `macro|user@example.com`).
pub fn caller_primary_inbox<'a>(inboxes: &'a [Link], caller_macro_id: &str) -> Option<&'a Link> {
    inboxes
        .iter()
        .find(|l| l.is_primary && l.macro_id.to_string() == caller_macro_id)
        .or_else(|| {
            inboxes
                .iter()
                .find(|l| l.macro_id.to_string() == caller_macro_id)
        })
        .or_else(|| inboxes.first())
}

/// Resolve an optional inbox selector (an inbox's email address) against the
/// caller's accessible inboxes. `None` resolves to the caller's primary inbox.
/// Errors when the address matches no accessible inbox, so a caller can never
/// scope to an inbox they don't have.
pub fn resolve_inbox_selector<'a>(
    inboxes: &'a [Link],
    caller_macro_id: &str,
    requested: Option<&str>,
) -> Result<&'a Link, ToolCallError> {
    let Some(addr) = requested.map(str::trim).filter(|s| !s.is_empty()) else {
        return caller_primary_inbox(inboxes, caller_macro_id).ok_or_else(|| ToolCallError {
            description: "No email account is linked for this user.".to_string(),
            internal_error: anyhow::anyhow!("no accessible inboxes"),
        });
    };

    let mut matches = inboxes
        .iter()
        .filter(|l| l.email_address.0.as_ref().eq_ignore_ascii_case(addr));
    match (matches.next(), matches.next()) {
        (Some(link), None) => Ok(link),
        (Some(_), Some(_)) => Err(ToolCallError {
            description: format!("Multiple connected inboxes match \"{addr}\"; cannot pick one."),
            internal_error: anyhow::anyhow!("ambiguous inbox selector: {addr}"),
        }),
        (None, _) => Err(ToolCallError {
            description: format!(
                "No connected inbox matches \"{addr}\". Connected inboxes: {}.",
                inboxes
                    .iter()
                    .map(|l| l.email_address.0.as_ref())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            internal_error: anyhow::anyhow!("unknown inbox selector: {addr}"),
        }),
    }
}

/// Service context for email AI tools.
pub struct EmailToolContext<
    T: EmailService,
    G: GmailTokenProvider = crate::domain::ports::NoOpGmailTokenProvider,
    E: EntityAccessService = entity_access::domain::service::EntityAccessServiceImpl<
        entity_access::outbound::PgAccessRepository,
    >,
> {
    /// The email service instance.
    pub service: Arc<T>,
    /// The Gmail token provider for resolving OAuth access tokens.
    pub token_provider: Arc<G>,
    /// The entity access service for verifying thread access.
    pub entity_access_service: Arc<E>,
    /// Renders model-authored markdown into the HTML an email body carries.
    pub lexical_client: Arc<lexical_client::LexicalClient>,
    /// Turns the Macro entities a user @-mentions into files, for
    /// `SendEmail`'s attachments. `None` on a host wired without one, where
    /// an attachment request is refused rather than dropped.
    pub entity_files: Option<Arc<dyn EntityFileService>>,
    /// Puts those files on the draft. Paired with `entity_files`: both or
    /// neither, since a file resolved with nowhere to go is no use.
    pub attachment_store: Option<Arc<dyn DraftAttachmentStore>>,
}

impl<T: EmailService, G: GmailTokenProvider, E: EntityAccessService> Clone
    for EmailToolContext<T, G, E>
{
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
            token_provider: self.token_provider.clone(),
            entity_access_service: self.entity_access_service.clone(),
            lexical_client: self.lexical_client.clone(),
            entity_files: self.entity_files.clone(),
            attachment_store: self.attachment_store.clone(),
        }
    }
}

impl<T: EmailService, G: GmailTokenProvider, E: EntityAccessService> EmailToolContext<T, G, E> {
    /// Create a new email tool context. Attachments are unavailable until
    /// [`with_attachments`](Self::with_attachments) supplies the two services
    /// that make them work.
    pub fn new(
        service: Arc<T>,
        token_provider: Arc<G>,
        entity_access_service: Arc<E>,
        lexical_client: Arc<lexical_client::LexicalClient>,
    ) -> Self {
        Self {
            service,
            token_provider,
            entity_access_service,
            lexical_client,
            entity_files: None,
            attachment_store: None,
        }
    }

    /// Enable `SendEmail`'s entity attachments.
    ///
    /// Taken together so a host cannot wire half of the pair and discover at
    /// send time that it can resolve a file but not store it.
    pub fn with_attachments(
        mut self,
        entity_files: Arc<dyn EntityFileService>,
        attachment_store: Arc<dyn DraftAttachmentStore>,
    ) -> Self {
        self.entity_files = Some(entity_files);
        self.attachment_store = Some(attachment_store);
        self
    }

    /// Resolve the entity references on a `SendEmail` call into files.
    ///
    /// All-or-nothing on purpose. A partial result here would mean sending an
    /// email that is missing an attachment the user asked for, with the model
    /// free to describe it as sent — the silent failure this feature exists to
    /// remove. Every failed reference is named in one error so the model can
    /// pass the whole story back to the user in a single turn.
    pub async fn resolve_attachment_files(
        &self,
        user_id: MacroUserIdStr<'_>,
        refs: &[send_email::EmailAttachmentRef],
    ) -> Result<Vec<NewDraftAttachment>, ToolCallError> {
        if refs.is_empty() {
            return Ok(Vec::new());
        }

        let Some(entity_files) = self.entity_files.as_ref() else {
            return Err(ToolCallError {
                description: "Attaching files to an email is not available here. Send the email without attachments, or share a link to the file instead.".to_owned(),
                internal_error: anyhow::anyhow!("no EntityFileService wired into EmailToolContext"),
            });
        };

        let entities = parse_attachment_refs(refs)?;
        let resolved = entity_files.resolve_files(user_id, &entities).await;
        collect_resolved_attachments(resolved, entities.len())
    }

    /// Put already-resolved files on a draft, in the order the model listed
    /// them.
    pub async fn attach_files(
        &self,
        link_id: uuid::Uuid,
        draft_id: uuid::Uuid,
        files: Vec<NewDraftAttachment>,
    ) -> Result<(), ToolCallError> {
        let Some(store) = self.attachment_store.as_ref() else {
            return Err(ToolCallError {
                description: "Attaching files to an email is not available here.".to_owned(),
                internal_error: anyhow::anyhow!(
                    "no DraftAttachmentStore wired into EmailToolContext"
                ),
            });
        };

        for file in files {
            let file_name = file.file_name.clone();
            store
                .attach_to_draft(link_id, draft_id, file)
                .await
                .map_err(|e| ToolCallError {
                    description: format!(
                        "Failed to attach \"{file_name}\", so the email was not sent: {e}"
                    ),
                    internal_error: e,
                })?;
        }

        Ok(())
    }

    /// Resolve the user's email link from their macro ID.
    ///
    /// This is shared across all email tools that need an authenticated link.
    pub async fn resolve_link(&self, macro_id: MacroUserIdStr<'_>) -> Result<Link, ToolCallError> {
        self.service
            .get_link_by_macro_id(macro_id)
            .await
            .map_err(|e| ToolCallError {
                description: format!("Failed to resolve email link: {e}"),
                internal_error: e.into(),
            })?
            .ok_or_else(|| ToolCallError {
                description: "No email account linked for this user.".to_string(),
                internal_error: anyhow::anyhow!("No email link found for user"),
            })
    }

    /// Resolves a `SendEmail` body into base64url HTML, rendering the model's
    /// Markdown through the lexical service when no composer already did.
    pub async fn render_body(&self, body: &str) -> Result<ResolvedToolBody, ToolCallError> {
        if decode_composer_html(body).is_some() {
            return Ok(ResolvedToolBody {
                html: body.to_owned(),
                text: None,
            });
        }

        let rendered = self
            .lexical_client
            .markdown_to_html(body)
            .await
            .map_err(|e| ToolCallError {
                description: format!("Failed to render the email body: {e}"),
                internal_error: e,
            })?;

        Ok(ResolvedToolBody {
            html: URL_SAFE_NO_PAD.encode(rendered.html),
            text: Some(rendered.text),
        })
    }

    /// Resolve a Gmail OAuth access token for the given link.
    pub async fn resolve_access_token(&self, link: &Link) -> Result<String, ToolCallError> {
        self.token_provider
            .fetch_gmail_access_token(link)
            .await
            .map_err(|e| ToolCallError {
                description: format!("Failed to fetch Gmail access token: {e}"),
                internal_error: e.into(),
            })
    }
}

/// Turn the tool's `{entityId, entityType}` pairs into [`Entity`] references.
///
/// An unparseable entity type is the model's mistake rather than a resolution
/// failure, so it is reported before anything is fetched.
fn parse_attachment_refs(
    refs: &[send_email::EmailAttachmentRef],
) -> Result<Vec<model_entity::Entity<'static>>, ToolCallError> {
    refs.iter()
        .map(|r| {
            let entity_type = EntityType::from_str(&r.entity_type).map_err(|_| ToolCallError {
                description: format!(
                    "\"{}\" is not a Macro entity type, so {} could not be attached.",
                    r.entity_type, r.entity_id
                ),
                internal_error: anyhow::anyhow!("unknown entity type: {}", r.entity_type),
            })?;
            Ok(entity_type.with_entity_string(r.entity_id.clone()))
        })
        .collect()
}

/// Fold a resolver's per-entity results into the attachments to send, or one
/// error naming everything that failed.
///
/// All-or-nothing: a partial result would mean sending an email missing an
/// attachment the user asked for, with the model free to call it sent. Every
/// failure is named in a single error so the model can relay the whole story
/// in one turn instead of discovering them one at a time.
fn collect_resolved_attachments(
    resolved: Vec<Result<attachment::EntityFile, attachment::ResolutionError>>,
    requested: usize,
) -> Result<Vec<NewDraftAttachment>, ToolCallError> {
    let mut files = Vec::with_capacity(resolved.len());
    let mut failures = Vec::new();
    for result in resolved {
        match result {
            Ok(file) => files.push(file),
            Err(e) => failures.push(format!(
                "{} {}: {}",
                e.reference.entity_type, e.reference.entity_id, e.error
            )),
        }
    }

    if !failures.is_empty() {
        return Err(ToolCallError {
            description: format!(
                "Could not attach {} of {} file(s), so the email was not sent: {}. Tell the user which attachment failed and why, then offer to send without it or to link it instead.",
                failures.len(),
                requested,
                failures.join("; ")
            ),
            internal_error: anyhow::anyhow!(
                "attachment resolution failed: {}",
                failures.join("; ")
            ),
        });
    }

    // The per-draft ceiling the HTTP endpoint enforces. Checked here too:
    // these files never pass through it, and the cost of finding out at
    // delivery time is a message the provider rejects.
    let total: usize = files.iter().map(|f| f.bytes.len()).sum();
    if total > MAX_RAW_ATTACHMENTS_SIZE_BYTES {
        return Err(ToolCallError {
            description: format!(
                "The attachments come to {:.1}MB, over the {}MB limit for email, so nothing was sent. Send fewer of them, or share links instead.",
                total as f64 / 1_000_000.0,
                MAX_RAW_ATTACHMENTS_SIZE_BYTES / 1_000_000,
            ),
            internal_error: anyhow::anyhow!("attachments total {total} bytes"),
        });
    }

    Ok(files
        .into_iter()
        .map(|f| NewDraftAttachment {
            file_name: f.file_name,
            content_type: f.content_type,
            bytes: f.bytes,
        })
        .collect())
}

/// A `SendEmail` body resolved into what [`CreateDraftInput`] expects.
///
/// [`CreateDraftInput`]: crate::domain::models::CreateDraftInput
pub struct ResolvedToolBody {
    /// Base64url-encoded HTML, the encoding the domain decodes.
    pub html: String,
    /// The plain-text alternative, when this tool rendered the body and so
    /// has one. A composer-supplied body carries its own, or none.
    pub text: Option<String>,
}

/// True when `body` is the base64url HTML a composer exported, rather than
/// the Markdown the model writes.
///
/// The two hosts that finish `SendEmail` disagree about this field: the chat
/// and agent-session composers replace it with their exported HTML before the
/// tool runs, while a host that answers the review without a composer leaves
/// the model's Markdown in place. Real Markdown does not survive a base64url
/// decode - a space alone is outside the alphabet - and composer output is
/// always an element, so decoding and looking for a tag separates them.
fn decode_composer_html(body: &str) -> Option<String> {
    let decoded = URL_SAFE_NO_PAD.decode(body.as_bytes()).ok()?;
    let decoded = String::from_utf8(decoded).ok()?;
    decoded.trim_start().starts_with('<').then_some(decoded)
}

/// The full email toolset, for hosts that finish user tools: the deferring
/// `SendEmail`, which a composer or review card confirms, beside
/// `SendConfirmedEmail`, which sends on a confirmation the user already
/// gave in conversation. Both are always registered; the prompt decides
/// which fits the surface the prompt came from.
pub fn email_toolset<T, G, E>() -> AsyncToolCollection<EmailToolContext<T, G, E>>
where
    T: EmailService,
    G: GmailTokenProvider,
    E: EntityAccessService,
{
    mcp_toolset()
        .add_user_tool::<SendEmail, EmailToolContext<T, G, E>>()
        .add_tool::<SendConfirmedEmail, EmailToolContext<T, G, E>>()
}

/// Email toolset for hosts without a composer (the MCP server and the
/// channel-mention bot) — excludes both sending tools: `SendEmail`'s draft
/// only a composer can review and send, and `SendConfirmedEmail` is for the
/// in-process agent's conversation turns, not for MCP clients with their
/// own confirmation policy.
pub fn mcp_toolset<T, G, E>() -> AsyncToolCollection<EmailToolContext<T, G, E>>
where
    T: EmailService,
    G: GmailTokenProvider,
    E: EntityAccessService,
{
    AsyncToolCollection::new()
        .add_tool::<UpdateThreadLabels, EmailToolContext<T, G, E>>()
        .add_tool::<GetThread, EmailToolContext<T, G, E>>()
        .add_tool::<ListLabels, EmailToolContext<T, G, E>>()
        .add_tool::<ListInboxes, EmailToolContext<T, G, E>>()
        .add_tool::<SetSenderPolicy, EmailToolContext<T, G, E>>()
}
