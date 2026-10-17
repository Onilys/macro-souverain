//! Opaque copies for providers that fetch media by URL. Eventual expiration is
//! handled by the email bucket temp/ lifecycle; native document ownership never changes.

use super::{
    models::MessagingError,
    ports::{MediaBytes, PortResult},
};
use async_trait::async_trait;
use std::sync::Arc;
use uuid::Uuid;

/// Lifetime of the signed URL, independently of physical object cleanup.
pub const MEDIA_URL_SECONDS: u64 = 15 * 60;
/// Existing email-bucket namespace, outside native document event consumers.
pub fn copy_key(id: Uuid) -> String {
    format!("temp/macro-messaging/{id}")
}

/// Object storage has access only to isolated temporary copies.
#[async_trait]
pub trait MediaCopyStorage: Send + Sync {
    /// Upload to the opaque key and sign only that object. Implementations bound I/O to sixty seconds.
    async fn put_copy(&self, bucket: &str, id: Uuid, file: &MediaBytes) -> PortResult<String>;
}

/// Capability supplied only after the native document access check.
#[async_trait]
pub trait TemporaryMedia: Send + Sync {
    /// Stage already-authorized native bytes without sharing the original document.
    async fn stage(&self, file: &MediaBytes) -> PortResult<String>;
}

/// Upload opaque bytes and sign only that copy; bucket lifecycle expires temp/ after one day.
pub struct TemporaryMediaService {
    storage: Arc<dyn MediaCopyStorage>,
    bucket: String,
}
impl TemporaryMediaService {
    /// Validate the configured bucket at composition, without accepting a user-supplied destination.
    pub fn new(storage: Arc<dyn MediaCopyStorage>, bucket: String) -> Result<Self, MessagingError> {
        if !(3..=63).contains(&bucket.len())
            || !bucket
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'-' | b'.'))
        {
            return Err(MessagingError::Invalid(
                "temporary media bucket is not configured correctly",
            ));
        }
        Ok(Self { storage, bucket })
    }
}
#[async_trait]
impl TemporaryMedia for TemporaryMediaService {
    async fn stage(&self, file: &MediaBytes) -> PortResult<String> {
        self.storage
            .put_copy(&self.bucket, Uuid::now_v7(), file)
            .await
    }
}
