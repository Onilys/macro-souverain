//! Server-side reply eligibility, also returned to composers as capabilities.

use chrono::{DateTime, Duration, Utc};

use super::models::{MessagingError, Provider, ReplyWindow};

#[cfg(test)]
mod test;

/// Sending intent authenticated by the invoking path, not a client actor flag.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SendAuthority {
    /// A person explicitly submitting an external reply.
    Human,
    /// Drafting never authorizes a provider request.
    DraftOnly,
}

/// Policy mode of the requested send.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReplyMode {
    /// Text or media within the standard customer service window.
    FreeForm,
    /// Server-resolved, approved, account-bound WhatsApp template.
    ApprovedTemplate,
    /// Instagram support tag, for unresolved human support within seven days.
    HumanSupport,
}

/// Verify policy again immediately before dispatch, including queued sends that
/// cross the boundary. Template status/parameters are verified by the provider
/// port; user permission and account binding are verified by the service.
pub fn authorize_send(
    window: &ReplyWindow,
    authority: SendAuthority,
    mode: ReplyMode,
    now: DateTime<Utc>,
) -> Result<(), MessagingError> {
    if authority == SendAuthority::DraftOnly {
        return Err(MessagingError::Forbidden);
    }
    if !window.connected {
        return Err(MessagingError::Disconnected);
    }
    let age = window.last_customer_message_at.map(|t| now - t);
    // Future timestamps are not evidence of an open window.
    let within = |limit| age.is_some_and(|age| age >= Duration::zero() && age < limit);
    match (window.provider, mode) {
        (Provider::Whatsapp, ReplyMode::ApprovedTemplate) => Ok(()),
        (Provider::Whatsapp, ReplyMode::FreeForm) if within(Duration::hours(24)) => Ok(()),
        (Provider::Whatsapp, ReplyMode::FreeForm) => Err(MessagingError::TemplateRequired),
        (Provider::Whatsapp, ReplyMode::HumanSupport) => Err(MessagingError::Invalid(
            "human support tags are available only for Instagram",
        )),
        (Provider::Instagram, ReplyMode::FreeForm) if within(Duration::hours(24)) => Ok(()),
        (Provider::Instagram, ReplyMode::FreeForm) => Err(MessagingError::ReplyWindowClosed),
        (Provider::Instagram, ReplyMode::HumanSupport) => {
            if authority != SendAuthority::Human || !window.human_agent_approved {
                return Err(MessagingError::HumanSupportRequired);
            }
            if !within(Duration::days(7)) {
                return Err(MessagingError::ReplyWindowClosed);
            }
            Ok(())
        }
        (Provider::Instagram, ReplyMode::ApprovedTemplate) => Err(MessagingError::Invalid(
            "WhatsApp templates cannot be sent through Instagram",
        )),
    }
}
