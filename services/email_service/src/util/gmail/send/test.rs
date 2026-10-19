use super::*;
use email::domain::models::AttachmentForwarded;
use email_api_client::domain::{
    models::{AccessToken, EmailApiError, TokenError, TokenFreshness},
    ports::AlwaysAllowRateLimiter,
};

const SOURCE: Uuid = Uuid::from_u128(1);
const SENDING: Uuid = Uuid::from_u128(2);

struct Tokens;
impl ProviderTokenSource for Tokens {
    async fn get_access_token(
        &self,
        link_id: Uuid,
        _: TokenFreshness,
    ) -> Result<AccessToken, TokenError> {
        assert_eq!(
            link_id, SOURCE,
            "download must use the original inbox, not the sender"
        );
        Ok(AccessToken::new("source-inbox-token"))
    }
    async fn get_access_token_for_link(
        &self,
        _: &Link,
        _: TokenFreshness,
    ) -> Result<AccessToken, TokenError> {
        panic!("forwarding uses the source inbox id");
    }
    async fn get_access_token_health_neutral(
        &self,
        _: &Link,
        _: TokenFreshness,
    ) -> Result<AccessToken, TokenError> {
        panic!("forwarding uses the source inbox id");
    }
}
struct Provider;
impl MailboxAttachmentClient for Provider {
    async fn get_attachment(
        &self,
        token: &AccessToken,
        message_id: &str,
        attachment_id: &str,
    ) -> Result<Vec<u8>, EmailApiError> {
        assert_eq!(token.expose_secret(), "source-inbox-token");
        assert_eq!(
            (message_id, attachment_id),
            ("original-message", "original-attachment")
        );
        Ok(b"pdf bytes".to_vec())
    }
}

#[tokio::test]
async fn forwarding_uses_source_credentials_and_preserves_existing_attachments() {
    let api = EmailApiClientServiceImpl::new(Provider, Tokens, AlwaysAllowRateLimiter);
    let sources = [ForwardedAttachmentSource {
        source_link_id: SOURCE,
        attachment: AttachmentForwarded {
            attachment_id: Uuid::from_u128(3),
            draft_id: Uuid::from_u128(4),
            provider_attachment_id: Some("original-attachment".into()),
            message_provider_id: "original-message".into(),
            filename: Some("report.pdf".into()),
            mime_type: Some("application/pdf".into()),
            size_bytes: Some(9),
        },
    }];
    let mut message = message::MessageToSend {
        db_id: Some(Uuid::from_u128(4)),
        provider_id: None,
        replying_to_id: None,
        provider_thread_id: None,
        thread_db_id: None,
        link_id: SENDING,
        subject: "Forward".into(),
        to: None,
        cc: None,
        bcc: None,
        body_text: None,
        body_html: None,
        body_macro: None,
        headers_json: None,
        send_time: None,
        attachments: Some(vec![AttachmentToSend {
            file_name: "local.txt".into(),
            content_type: "text/plain".into(),
            data: b"local".to_vec(),
        }]),
    };
    fetch_and_attach_forwarded_attachments(&api, &sources, &mut message)
        .await
        .unwrap();
    let attachments = message.attachments.unwrap();
    assert_eq!(attachments.len(), 2);
    assert_eq!(attachments[0].data, b"local");
    assert_eq!(attachments[1].file_name, "report.pdf");
    assert_eq!(attachments[1].content_type, "application/pdf");
    assert_eq!(attachments[1].data, b"pdf bytes");
    assert_eq!(message.link_id, SENDING);
}
