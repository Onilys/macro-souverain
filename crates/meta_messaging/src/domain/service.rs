//! Account and sending use cases. Receipts authorize API calls; current
//! permission and provider policy are checked again when durable work executes.

use std::sync::Arc;

use chrono::{Duration, Utc};
use entity_access::domain::models::{AdminTeamRole, EntityAccessReceipt, EntityType};
use messages::domain::service::{MessageView, MessageWrite};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::{connection::*, events::*, models::*, policy::*, ports::*};

mod history;
mod worker;
use worker::IngestionLease;

/// Shared use-case service, with all infrastructure supplied by its composition root.
#[derive(Clone)]
pub struct MessagingService {
    /// Durable state used by the inbound worker driver.
    pub repository: Arc<dyn MessagingRepository>,
    provider: Arc<dyn MetaProvider>,
    cipher: Arc<dyn CredentialCipher>,
    native: Arc<dyn NativeMessaging>,
    configuration: PublicConfiguration,
}

impl MessagingService {
    /// Wire capabilities once; secret configuration is validated by adapters at startup.
    pub fn new(
        repository: Arc<dyn MessagingRepository>,
        provider: Arc<dyn MetaProvider>,
        cipher: Arc<dyn CredentialCipher>,
        native: Arc<dyn NativeMessaging>,
        configuration: PublicConfiguration,
    ) -> Self {
        Self {
            repository,
            provider,
            cipher,
            native,
            configuration,
        }
    }

    /// Return only non-secret integration configuration.
    pub fn configuration(&self) -> &PublicConfiguration {
        &self.configuration
    }

    /// Connect an explicitly enabled local test number using server-only credentials.
    pub async fn connect_developer(
        &self,
        access: &EntityAccessReceipt<AdminTeamRole>,
    ) -> PortResult<Connection> {
        let (team, user) = team_actor(access)?;
        if !self.configuration.whatsapp_developer_available {
            return Err(MessagingError::Forbidden.into());
        }
        let account = self.provider.developer_account().await?;
        let existing = self
            .repository
            .account(Provider::Whatsapp, &account.account_id)
            .await?;
        if existing
            .as_ref()
            .is_some_and(|c| c.team_id != team || !c.developer_account)
        {
            return Err(MessagingError::Conflict.into());
        }
        let reconnect = existing.as_ref().map(|c| c.id);
        let id = reconnect.unwrap_or_else(Uuid::now_v7);
        let sealed = self.cipher.encrypt(team, id, &account.token).await?;
        let connection = Connection {
            id,
            team_id: team,
            user_id: user.into(),
            provider: Provider::Whatsapp,
            account_id: account.account_id,
            business_account_id: account.business_account_id,
            display_name: account.display_name,
            status: ConnectionStatus::Connecting,
            connected_at: Some(Utc::now()),
            credential_expires_at: account.expires_at,
            human_agent_approved: false,
            developer_account: true,
            history_status: HistoryStatus::NotRequested,
            history_progress: None,
            health_error: None,
        };
        self.repository
            .connect(&connection, &sealed, reconnect)
            .await
    }

    /// Accept a signature-verified envelope durably before HTTP acknowledgement.
    pub async fn receive(
        &self,
        provider: Provider,
        body_sha256: &[u8],
        payload: &serde_json::Value,
    ) -> PortResult<()> {
        self.repository
            .accept_receipt(provider, body_sha256, payload)
            .await
    }

    /// Read bounded message delivery through the native channel access receipt.
    pub async fn message_delivery(
        &self,
        access: &EntityAccessReceipt<MessageView>,
        message_ids: &[Uuid],
    ) -> PortResult<Vec<SendProgress>> {
        if message_ids.len() > 100 {
            return Err(MessagingError::Invalid("request at most 100 message statuses").into());
        }
        let Some(conversation) = self.conversation(access).await? else {
            return Ok(vec![]);
        };
        self.repository
            .sends_for_messages(conversation.channel_id, message_ids)
            .await
    }

    /// Resolve provider metadata only after the native channel's access check.
    pub async fn conversation_view(
        &self,
        access: &EntityAccessReceipt<MessageView>,
    ) -> PortResult<Option<ConversationView>> {
        let Some(conversation) = self.conversation(access).await? else {
            return Ok(None);
        };
        let account = self
            .repository
            .connection(conversation.connection_id)
            .await?
            .ok_or(MessagingError::NotFound)?;
        let sends = self.repository.sends(conversation.channel_id).await?;
        let can_reply = if let Ok(user) = access.get_authenticated_user() {
            self.native
                .require_send(account.team_id, conversation.channel_id, user.as_ref())
                .await
                .is_ok()
        } else {
            false
        };
        Ok(Some(ConversationView {
            can_reply,
            text_limit: if account.provider == Provider::Whatsapp {
                4096
            } else {
                1000
            },
            text_limit_in_bytes: account.provider == Provider::Instagram,
            media: super::media::capabilities(account.provider),
            conversation,
            provider: account.provider,
            account_name: account.display_name,
            status: account.status,
            health_error: account.health_error,
            developer_account: account.developer_account,
            human_agent_approved: account.human_agent_approved
                && self.configuration.instagram_human_agent_approved,
            sends,
        }))
    }

    /// List team account health using a verified administrator receipt.
    pub async fn connections(
        &self,
        access: &EntityAccessReceipt<AdminTeamRole>,
    ) -> PortResult<Vec<Connection>> {
        let (team, _) = team_actor(access)?;
        self.repository.connections(team).await
    }

    /// Start one caller-bound authorization attempt, including reconnect identity.
    pub async fn begin_authorization(
        &self,
        access: &EntityAccessReceipt<AdminTeamRole>,
        provider: Provider,
        reconnect: Option<Uuid>,
    ) -> PortResult<BeginAuthorization> {
        let (team, user) = team_actor(access)?;
        let configured = match provider {
            Provider::Whatsapp => {
                self.configuration.whatsapp_app_id.is_some()
                    && self.configuration.whatsapp_configuration_id.is_some()
            }
            Provider::Instagram => {
                self.configuration.instagram_app_id.is_some()
                    && self.configuration.instagram_redirect_uri.is_some()
            }
        };
        if !configured {
            return Err(MessagingError::Invalid("this provider is not configured; ask the server administrator to complete Meta setup").into());
        }
        if let Some(id) = reconnect {
            self.team_connection(team, id).await?;
        }
        // These are random CSRF tokens, not database identifiers.
        let state = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        self.repository
            .begin_authorization(&OAuthAttempt {
                state_sha256: Sha256::digest(state.as_bytes()).to_vec(),
                team_id: team,
                user_id: user.to_owned(),
                provider,
                reconnect_id: reconnect,
                expires_at: Utc::now() + Duration::minutes(10),
            })
            .await?;
        Ok(BeginAuthorization {
            state,
            configuration: self.configuration.clone(),
        })
    }

    /// Complete authorization under the same authenticated team/user. Account
    /// facts are independently resolved through Meta before storing credentials.
    pub async fn complete_authorization(
        &self,
        access: &EntityAccessReceipt<AdminTeamRole>,
        input: CompleteAuthorization,
    ) -> PortResult<Connection> {
        let (team, user) = team_actor(access)?;
        if input.state.len() != 64 || input.code.is_empty() || input.code.len() > 8192 {
            return Err(MessagingError::Invalid("invalid authorization callback").into());
        }
        let attempt = self
            .repository
            .consume_authorization(&Sha256::digest(input.state.as_bytes()), team, user)
            .await?;
        self.finish_authorization(attempt, input).await
    }

    /// Official Instagram callback: the one-time state binds the initiating user
    /// and team, whose administrator access is revalidated before token exchange.
    pub async fn instagram_callback(&self, state: String, code: String) -> PortResult<()> {
        if state.len() != 64 || code.is_empty() || code.len() > 8192 {
            return Err(MessagingError::Forbidden.into());
        }
        let attempt = self
            .repository
            .consume_instagram_callback(&Sha256::digest(state.as_bytes()))
            .await?;
        self.native
            .require_admin(attempt.team_id, &attempt.user_id)
            .await?;
        self.finish_authorization(
            attempt,
            CompleteAuthorization {
                state,
                code,
                business_account_id: None,
                phone_number_id: None,
            },
        )
        .await?;
        Ok(())
    }

    async fn finish_authorization(
        &self,
        attempt: OAuthAttempt,
        input: CompleteAuthorization,
    ) -> PortResult<Connection> {
        let team = attempt.team_id;
        let user = attempt.user_id.as_str();
        let account = self.provider.authorize(attempt.provider, &input).await?;
        let id = attempt.reconnect_id.unwrap_or_else(Uuid::now_v7);
        if let Some(existing) = attempt.reconnect_id {
            let original = self.team_connection(team, existing).await?;
            if original.provider != attempt.provider
                || original.account_id != account.account_id
                || original.business_account_id != account.business_account_id
            {
                return Err(MessagingError::Conflict.into());
            }
        }
        let sealed = self.cipher.encrypt(team, id, &account.token).await?;
        let connection = Connection {
            id,
            team_id: team,
            user_id: user.to_owned(),
            provider: attempt.provider,
            account_id: account.account_id,
            business_account_id: account.business_account_id,
            display_name: account.display_name,
            status: ConnectionStatus::Connecting,
            connected_at: Some(Utc::now()),
            credential_expires_at: account.expires_at,
            human_agent_approved: attempt.provider == Provider::Instagram
                && self.configuration.instagram_human_agent_approved,
            developer_account: false,
            history_status: HistoryStatus::NotRequested,
            history_progress: None,
            health_error: None,
        };
        // Subscription is retryable maintenance, so a provider outage cannot lose
        // an exchanged single-use code before its credential has been sealed.
        self.repository
            .connect(&connection, &sealed, attempt.reconnect_id)
            .await
    }

    /// Stop local receiving/sending immediately. Return whether Meta confirmed
    /// removal of its subscription so the UI can explain any remaining app action.
    pub async fn disconnect(
        &self,
        access: &EntityAccessReceipt<AdminTeamRole>,
        id: Uuid,
    ) -> PortResult<DisconnectResult> {
        let (team, user) = team_actor(access)?;
        let connection = self.team_connection(team, id).await?;
        let _guard = self
            .repository
            .lock_subscription(&connection)
            .await?
            .ok_or(MessagingError::Unavailable)?;
        self.native.require_admin(team, user).await?;
        // Authorization can have changed while waiting for another lifecycle operation.
        let connection = self.team_connection(team, id).await?;
        let token = self.token(&connection).await.ok();
        self.repository.disconnect(team, id).await?;
        self.remove_unused_subscription(&connection, token.as_ref())
            .await
    }

    // Caller holds the subscription guard through the remote operation. A separate
    // connection (even on another Macro team) is not ours to disconnect.
    async fn remove_unused_subscription(
        &self,
        c: &Connection,
        token: Option<&AccessToken>,
    ) -> PortResult<DisconnectResult> {
        if self.repository.subscription_in_use(c).await? {
            return Ok(DisconnectResult {
                remote_unsubscribed: false,
                shared_subscription_kept: true,
            });
        }
        let remote_unsubscribed = match token {
            Some(token) => self.provider.unsubscribe(c, token).await.is_ok(),
            None => false,
        };
        Ok(DisconnectResult {
            remote_unsubscribed,
            shared_subscription_kept: false,
        })
    }

    /// Channel-level metadata follows ordinary channel access, independently of
    /// whether the caller may manage the connected account.
    pub async fn conversation(
        &self,
        access: &EntityAccessReceipt<MessageView>,
    ) -> PortResult<Option<Conversation>> {
        self.repository.conversation(channel_id(access)?).await
    }

    /// Approved templates are read only through a channel the caller can view.
    pub async fn templates(
        &self,
        access: &EntityAccessReceipt<MessageView>,
    ) -> PortResult<Vec<Template>> {
        let conversation = self
            .repository
            .conversation(channel_id(access)?)
            .await?
            .ok_or(MessagingError::NotFound)?;
        let connection = self
            .repository
            .connection(conversation.connection_id)
            .await?
            .ok_or(MessagingError::NotFound)?;
        let user = access
            .get_authenticated_user()
            .map_err(|_| MessagingError::Forbidden)?;
        self.native
            .require_send(connection.team_id, conversation.channel_id, user.as_ref())
            .await?;
        let token = self.token(&connection).await?;
        self.provider.templates(&connection, &token).await
    }

    /// Explicit external-send boundary. Bot/harness callers remain draft-only;
    /// ordinary MessageService posts have no dependency on this service.
    pub async fn send_reply(
        &self,
        access: &EntityAccessReceipt<MessageWrite>,
        request: SendReply,
        authority: SendAuthority,
    ) -> PortResult<SendProgress> {
        if authority != SendAuthority::Human {
            return Err(MessagingError::Forbidden.into());
        }
        let channel = channel_id(access)?;
        let user = access
            .get_authenticated_user()
            .map_err(|_| MessagingError::Forbidden)?
            .as_ref();
        let conversation = self
            .repository
            .conversation(channel)
            .await?
            .ok_or(MessagingError::NotFound)?;
        let connection = self
            .repository
            .connection(conversation.connection_id)
            .await?
            .ok_or(MessagingError::NotFound)?;
        self.native
            .require_send(connection.team_id, channel, user)
            .await?;
        self.validate_send(&connection, &conversation, &request)
            .await?;
        if let ReplyContent::Template {
            template_id,
            language,
            parameters,
        } = &request.message
        {
            let token = self.token(&connection).await?;
            let templates = self.provider.templates(&connection, &token).await?;
            let template = templates
                .iter()
                .find(|t| t.id == *template_id && t.language == *language)
                .ok_or(MessagingError::Invalid(
                    "template is not approved for this account and language",
                ))?;
            let layout = super::templates::text_parameters(&template.components)?;
            if layout.len() != parameters.len() || parameters.iter().any(|p| p.trim().is_empty()) {
                return Err(
                    MessagingError::Invalid("fill every approved template parameter").into(),
                );
            }
        }
        if let ReplyContent::Media {
            document_id,
            kind,
            caption,
        } = &request.message
        {
            let file = self
                .native
                .outgoing_media(user, channel, *document_id)
                .await?;
            super::media::validate(
                connection.provider,
                *kind,
                &file.file.mime_type,
                file.file.bytes.len(),
                caption.as_deref(),
            )?;
        }
        let encoded = serde_json::to_vec(&request)
            .map_err(|_| MessagingError::Invalid("invalid send request"))?;
        self.repository
            .enqueue_send(
                connection.id,
                channel,
                user,
                &request,
                &Sha256::digest(encoded),
            )
            .await
    }

    /// A file selection creates only a private Macro document, never an outbound intent.
    pub async fn upload_attachment(
        &self,
        access: &EntityAccessReceipt<MessageWrite>,
        file: MediaBytes,
    ) -> PortResult<UploadedAttachment> {
        let channel = channel_id(access)?;
        let user = access
            .get_authenticated_user()
            .map_err(|_| MessagingError::Forbidden)?
            .as_ref();
        let conversation = self
            .repository
            .conversation(channel)
            .await?
            .ok_or(MessagingError::NotFound)?;
        let connection = self
            .repository
            .connection(conversation.connection_id)
            .await?
            .ok_or(MessagingError::NotFound)?;
        self.native
            .require_send(connection.team_id, channel, user)
            .await?;
        let kind = if file.mime_type.starts_with("image/") {
            super::events::MediaKind::Image
        } else if file.mime_type.starts_with("audio/") {
            super::events::MediaKind::Audio
        } else if file.mime_type.starts_with("video/") {
            super::events::MediaKind::Video
        } else {
            super::events::MediaKind::Document
        };
        super::media::validate(
            connection.provider,
            kind,
            &file.mime_type,
            file.bytes.len(),
            None,
        )?;
        self.native.upload_attachment(user, channel, file).await
    }

    async fn team_connection(&self, team: Uuid, id: Uuid) -> PortResult<Connection> {
        self.repository
            .connection(id)
            .await?
            .filter(|c| c.team_id == team)
            .ok_or_else(|| MessagingError::NotFound.into())
    }
    async fn token(&self, connection: &Connection) -> PortResult<AccessToken> {
        if matches!(
            connection.status,
            ConnectionStatus::Disconnected | ConnectionStatus::Revoked
        ) {
            return Err(MessagingError::Disconnected.into());
        }
        let bytes = self.repository.credential(connection.id).await?;
        self.cipher
            .decrypt(connection.team_id, connection.id, &bytes)
            .await
    }

    async fn validate_send(
        &self,
        connection: &Connection,
        conversation: &Conversation,
        request: &SendReply,
    ) -> PortResult<()> {
        if request.human_support && !self.configuration.instagram_human_agent_approved {
            return Err(MessagingError::HumanSupportRequired.into());
        }
        validate_reply(connection, conversation, request)?;
        if let Some(message) = &request.reply_to
            && !self.repository.has_message(conversation, message).await?
        {
            return Err(MessagingError::Invalid(
                "quoted message does not belong to this customer conversation",
            )
            .into());
        }
        Ok(())
    }
}

fn team_actor(access: &EntityAccessReceipt<AdminTeamRole>) -> Result<(Uuid, &str), MessagingError> {
    if access.entity().entity_type != EntityType::Team {
        return Err(MessagingError::Forbidden);
    }
    Ok((
        access
            .entity()
            .entity_id
            .parse()
            .map_err(|_| MessagingError::Forbidden)?,
        access
            .get_authenticated_user()
            .map_err(|_| MessagingError::Forbidden)?
            .as_ref(),
    ))
}
fn channel_id<T: entity_access::domain::models::RequiredPermission>(
    access: &EntityAccessReceipt<T>,
) -> Result<Uuid, MessagingError> {
    if access.entity().entity_type != EntityType::Channel {
        return Err(MessagingError::Forbidden);
    }
    access
        .entity()
        .entity_id
        .parse()
        .map_err(|_| MessagingError::Forbidden)
}

fn validate_reply(
    connection: &Connection,
    conversation: &Conversation,
    request: &SendReply,
) -> Result<(), MessagingError> {
    if request.idempotency_key.is_nil() {
        return Err(MessagingError::Invalid(
            "a stable send intent key is required",
        ));
    }
    let mode = match request.message {
        ReplyContent::Template { .. } => ReplyMode::ApprovedTemplate,
        _ if request.human_support => ReplyMode::HumanSupport,
        _ => ReplyMode::FreeForm,
    };
    let window = ReplyWindow {
        provider: connection.provider,
        connected: connection.status == ConnectionStatus::Connected,
        last_customer_message_at: conversation.last_customer_message_at,
        human_agent_approved: connection.human_agent_approved,
    };
    authorize_send(&window, SendAuthority::Human, mode, Utc::now())?;
    match &request.message {
        ReplyContent::Text { text }
            if text.trim().is_empty()
                || match connection.provider {
                    Provider::Whatsapp => text.chars().count() > 4096,
                    Provider::Instagram => text.len() > 1000,
                } =>
        {
            Err(MessagingError::Invalid(
                "message exceeds this provider's text limit or is empty",
            ))
        }
        ReplyContent::Template {
            parameters,
            language,
            ..
        } if parameters.len() > 50
            || parameters.iter().any(|s| s.len() > 1024)
            || language.len() > 32
            || language.is_empty() =>
        {
            Err(MessagingError::Invalid(
                "invalid template parameters or language",
            ))
        }
        ReplyContent::Media { caption, .. }
            if caption.as_ref().is_some_and(|s| s.chars().count() > 1024) =>
        {
            Err(MessagingError::Invalid("attachment caption is too long"))
        }
        _ => Ok(()),
    }
}
