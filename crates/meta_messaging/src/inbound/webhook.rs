//! Verify the raw envelope before decoding. Durability is provided by the
//! receipt service; a successful signature alone does not acknowledge delivery.

use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use serde_json::Value;
use sha2::Sha256;

use crate::domain::{
    events::*,
    models::{DeliveryState, MessagingError, Provenance, Provider, ProviderId},
};

#[cfg(test)]
mod test;

/// Largest accepted raw notification body.
pub const MAX_WEBHOOK_BYTES: usize = 4 * 1024 * 1024;
/// Maximum decoded facts per receipt, bounding worker transactions.
pub const MAX_EVENTS: usize = 20_000;

/// Authenticate exact raw bytes using Meta's SHA-256 signature. Malformed,
/// missing and incorrect signatures all fail closed, using constant-time MAC verification.
pub fn verify_signature(secret: &[u8], signature: &str, body: &[u8]) -> Result<(), MessagingError> {
    if body.len() > MAX_WEBHOOK_BYTES || secret.is_empty() {
        return Err(MessagingError::Invalid(
            "invalid webhook size or configuration",
        ));
    }
    let hex = signature
        .strip_prefix("sha256=")
        .filter(|s| s.len() == 64)
        .ok_or(MessagingError::Forbidden)?;
    let mut expected = [0_u8; 32];
    for (i, chunk) in hex.as_bytes().chunks_exact(2).enumerate() {
        let digit = |c: u8| {
            (c as char)
                .to_digit(16)
                .map(|d| d as u8)
                .ok_or(MessagingError::Forbidden)
        };
        expected[i] = digit(chunk[0])? * 16 + digit(chunk[1])?;
    }
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).map_err(|_| MessagingError::Forbidden)?;
    mac.update(body);
    mac.verify_slice(&expected)
        .map_err(|_| MessagingError::Forbidden)
}

/// Translate only the selected official product's envelope. Retrying a malformed
/// receipt cannot turn it into fabricated content or an external send.
pub fn decode(provider: Provider, payload: &Value) -> Result<Vec<IncomingEvent>, MessagingError> {
    let expected = match provider {
        Provider::Whatsapp => "whatsapp_business_account",
        Provider::Instagram => "instagram",
    };
    if payload.get("object").and_then(Value::as_str) != Some(expected) {
        return Err(MessagingError::Invalid(
            "webhook product does not match this endpoint",
        ));
    }
    let entries = array(payload, "entry")?;
    let mut events = Vec::new();
    for entry in entries {
        match provider {
            Provider::Whatsapp => whatsapp(entry, &mut events)?,
            Provider::Instagram => instagram(entry, &mut events)?,
        }
        if events.len() > MAX_EVENTS {
            return Err(MessagingError::Invalid("too many webhook events"));
        }
    }
    Ok(events)
}

fn string<'a>(v: &'a Value, key: &str) -> Result<&'a str, MessagingError> {
    v.get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or(MessagingError::Invalid(
            "provider payload is missing a required field",
        ))
}
fn id(v: &Value, key: &str) -> Result<ProviderId, MessagingError> {
    string(v, key)?.to_owned().try_into()
}
fn array<'a>(v: &'a Value, key: &str) -> Result<&'a [Value], MessagingError> {
    v.get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .ok_or(MessagingError::Invalid(
            "provider payload is missing an event collection",
        ))
}
fn optional_array<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    v.get(key)
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}
fn timestamp(v: &Value, milliseconds: bool) -> Result<DateTime<Utc>, MessagingError> {
    let seconds = v
        .as_i64()
        .or_else(|| v.as_str()?.parse().ok())
        .ok_or(MessagingError::Invalid("provider timestamp is invalid"))?;
    let timestamp = if milliseconds {
        DateTime::from_timestamp_millis(seconds)
    } else {
        DateTime::from_timestamp(seconds, 0)
    };
    timestamp
        .filter(|t| t.timestamp() >= 0)
        .ok_or(MessagingError::Invalid("provider timestamp is invalid"))
}
fn optional_string(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn whatsapp(entry: &Value, events: &mut Vec<IncomingEvent>) -> Result<(), MessagingError> {
    for change in array(entry, "changes")? {
        let field = string(change, "field")?;
        let value = &change["value"];
        if field == "account_update" && value["event"] == "PARTNER_REMOVED" {
            events.push(IncomingEvent::Disconnected {
                account_id: id(entry, "id")?,
                business_account: true,
            });
            continue;
        }
        let account = id(&value["metadata"], "phone_number_id").ok();
        let Some(account) = account else {
            events.push(IncomingEvent::Unsupported {
                account_id: Some(id(entry, "id")?),
                field: field.to_owned(),
            });
            continue;
        };
        let provenance = match field {
            "messages" => Provenance::Customer,
            "smb_message_echoes" => Provenance::PhoneEcho,
            "history" => Provenance::OnboardingHistory,
            _ => {
                events.push(IncomingEvent::Unsupported {
                    account_id: Some(account),
                    field: field.to_owned(),
                });
                continue;
            }
        };
        for message in optional_array(
            value,
            if field == "smb_message_echoes" {
                "message_echoes"
            } else {
                "messages"
            },
        ) {
            let customer = if provenance == Provenance::PhoneEcho {
                id(message, "to")?
            } else {
                id(message, "from")?
            };
            let name = optional_array(value, "contacts")
                .iter()
                .find(|contact| contact["wa_id"].as_str() == Some(customer.as_str()))
                .and_then(|contact| optional_string(&contact["profile"], "name"));
            let mut normalized =
                wa_message(message, account.clone(), customer, provenance, name, None)?;
            if provenance == Provenance::OnboardingHistory && !normalized.media.is_empty() {
                normalized.message_type = "history_media".into();
            }
            events.push(IncomingEvent::Message(normalized));
        }
        for status in optional_array(value, "statuses") {
            let state = match string(status, "status")? {
                "sent" => DeliveryState::Sent,
                "delivered" => DeliveryState::Delivered,
                "read" => DeliveryState::Read,
                "failed" => DeliveryState::Failed,
                other => {
                    events.push(IncomingEvent::Unsupported {
                        account_id: Some(account.clone()),
                        field: format!("status:{other}"),
                    });
                    continue;
                }
            };
            events.push(IncomingEvent::Status {
                account_id: account.clone(),
                message_id: id(status, "id")?,
                state,
                timestamp: timestamp(&status["timestamp"], false)?,
                error_code: optional_array(status, "errors")
                    .first()
                    .and_then(|e| e["code"].as_i64())
                    .map(|c| c.to_string()),
            });
        }
        for chunk in optional_array(value, "history") {
            for thread in optional_array(chunk, "threads") {
                let customer = id(thread, "id")?;
                for message in array(thread, "messages")? {
                    let direction = if string(message, "from")? == customer.as_str() {
                        Direction::Inbound
                    } else {
                        Direction::Outbound
                    };
                    events.push(IncomingEvent::Message(wa_message(
                        message,
                        account.clone(),
                        customer.clone(),
                        Provenance::OnboardingHistory,
                        None,
                        Some(direction),
                    )?));
                    if events.len() > MAX_EVENTS {
                        return Err(MessagingError::Invalid("too many history events"));
                    }
                }
            }
            events.push(IncomingEvent::HistoryProgress {
                account_id: account.clone(),
                progress: chunk["metadata"]["progress"]
                    .as_u64()
                    .and_then(|n| u8::try_from(n).ok())
                    .filter(|n| *n <= 100),
                declined: optional_array(chunk, "errors")
                    .iter()
                    .any(|e| e["code"] == 2593109),
            });
        }
    }
    Ok(())
}

fn wa_message(
    message: &Value,
    account_id: ProviderId,
    customer_id: ProviderId,
    provenance: Provenance,
    author_name: Option<String>,
    direction: Option<Direction>,
) -> Result<IncomingMessage, MessagingError> {
    let kind = string(message, "type")?;
    let mut media = Vec::new();
    let content = match kind {
        "text" => string(&message["text"], "body")?.to_owned(),
        "image" | "sticker" | "audio" | "video" | "document" => {
            let source = &message[kind];
            media.push(IncomingMedia {
                kind: match kind {
                    "audio" => MediaKind::Audio,
                    "video" => MediaKind::Video,
                    "document" => MediaKind::Document,
                    _ => MediaKind::Image,
                },
                id: Some(id(source, "id")?),
                url: None,
                mime_type: optional_string(source, "mime_type"),
                filename: optional_string(source, "filename"),
                sha256: optional_string(source, "sha256"),
            });
            optional_string(source, "caption").unwrap_or_default()
        }
        "location" => format!(
            "[Location] {}",
            serde_json::to_string(&message["location"])
                .map_err(|_| MessagingError::Invalid("invalid location"))?
        ),
        "contacts" => format!(
            "[Shared contact] {}",
            serde_json::to_string(&message["contacts"])
                .map_err(|_| MessagingError::Invalid("invalid contacts"))?
        ),
        "media_placeholder" => {
            "Attachment not provided by WhatsApp. View it in the original app.".to_owned()
        }
        "unsupported" => {
            "[Unsupported WhatsApp content. Open WhatsApp Business to view it.]".to_owned()
        }
        other => format!("[WhatsApp {other} event; view the original in WhatsApp Business]"),
    };
    Ok(IncomingMessage {
        provider: Provider::Whatsapp,
        account_id,
        customer_id,
        message_id: id(message, "id")?,
        author_name,
        author_handle: None,
        content,
        timestamp: timestamp(&message["timestamp"], false)?,
        direction: direction.unwrap_or(if provenance == Provenance::PhoneEcho {
            Direction::Outbound
        } else {
            Direction::Inbound
        }),
        provenance,
        message_type: kind.to_owned(),
        reply_to: message.get("context").and_then(|c| id(c, "id").ok()),
        media,
    })
}

fn instagram(entry: &Value, events: &mut Vec<IncomingEvent>) -> Result<(), MessagingError> {
    let account = id(entry, "id")?;
    for event in optional_array(entry, "messaging") {
        let Some(message) = event.get("message") else {
            if let Some(mid) = event.get("read").and_then(|r| id(r, "mid").ok()) {
                events.push(IncomingEvent::Status {
                    account_id: account.clone(),
                    message_id: mid,
                    state: DeliveryState::Read,
                    timestamp: timestamp(&event["timestamp"], true)?,
                    error_code: None,
                });
            } else {
                events.push(IncomingEvent::Unsupported {
                    account_id: Some(account.clone()),
                    field: "instagram_messaging_event".to_owned(),
                });
            }
            continue;
        };
        let echo = message["is_echo"].as_bool().unwrap_or(false);
        let sender = id(&event["sender"], "id")?;
        let recipient = id(&event["recipient"], "id")?;
        if (!echo && recipient != account) || (echo && sender != account) {
            return Err(MessagingError::Invalid(
                "Instagram message account does not match envelope",
            ));
        }
        let customer = if echo { recipient } else { sender };
        let mut media = Vec::new();
        let mut unsupported = Vec::new();
        for attachment in optional_array(message, "attachments") {
            let kind = string(attachment, "type")?;
            let media_kind = match kind {
                "image" => MediaKind::Image,
                "audio" => MediaKind::Audio,
                "video" => MediaKind::Video,
                "file" => MediaKind::Document,
                _ => {
                    unsupported.push(kind.to_owned());
                    continue;
                }
            };
            media.push(IncomingMedia {
                kind: media_kind,
                id: None,
                url: Some(string(&attachment["payload"], "url")?.to_owned()),
                mime_type: None,
                filename: None,
                sha256: None,
            });
        }
        if media.len() > 10 {
            return Err(MessagingError::Invalid("too many Instagram attachments"));
        }
        let mut content = optional_string(message, "text").unwrap_or_default();
        if message["is_deleted"] == true {
            content = "[Message deleted on Instagram]".to_owned();
        }
        for kind in unsupported {
            content.push_str(&format!(
                "\n[Unsupported Instagram {kind}; view it in Instagram]"
            ));
        }
        if content.is_empty() && media.is_empty() {
            content = "[Unsupported Instagram content]".to_owned();
        }
        events.push(IncomingEvent::Message(IncomingMessage {
            provider: Provider::Instagram,
            account_id: account.clone(),
            customer_id: customer,
            message_id: id(message, "mid")?,
            author_handle: None,
            author_name: None,
            content,
            timestamp: timestamp(&event["timestamp"], true)?,
            direction: if echo {
                Direction::Outbound
            } else {
                Direction::Inbound
            },
            provenance: if echo {
                Provenance::PhoneEcho
            } else {
                Provenance::Customer
            },
            message_type: if message["is_deleted"] == true {
                "deleted"
            } else {
                "message"
            }
            .to_owned(),
            reply_to: message.get("reply_to").and_then(|r| id(r, "mid").ok()),
            media,
        }));
    }
    for change in optional_array(entry, "changes") {
        events.push(IncomingEvent::Unsupported {
            account_id: Some(account.clone()),
            field: string(change, "field")?.to_owned(),
        });
    }
    Ok(())
}
