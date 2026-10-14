//! S3 + Postgres implementation of [`DraftAttachmentStore`].
//!
//! Mirrors what the `POST /email/drafts/{id}/attachments` handler and the
//! browser do between them, with both halves on this side of the wire: the
//! same `draft/{draft_id}/{attachment_id}` key, the same bucket, the same
//! `email_attachments_drafts` row. Keeping the key shape identical is what
//! lets the existing send and cleanup paths treat these attachments as
//! ordinary ones.

use async_trait::async_trait;
use models_email::service;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::models::NewDraftAttachment;
use crate::domain::ports::DraftAttachmentStore;

/// Stores draft attachments in the email attachment bucket.
pub struct S3DraftAttachmentStore {
    db: PgPool,
    s3: s3_client::S3,
    bucket: String,
}

impl S3DraftAttachmentStore {
    /// Create a store writing to `bucket`.
    pub fn new(db: PgPool, s3: s3_client::S3, bucket: String) -> Self {
        Self { db, s3, bucket }
    }
}

#[async_trait]
impl DraftAttachmentStore for S3DraftAttachmentStore {
    #[tracing::instrument(skip(self, file), fields(
        file_name = %file.file_name,
        content_type = %file.content_type,
        size = file.bytes.len(),
    ), err)]
    async fn attach_to_draft(
        &self,
        link_id: Uuid,
        draft_id: Uuid,
        file: NewDraftAttachment,
    ) -> anyhow::Result<Uuid> {
        let attachment_id = macro_uuid::generate_uuid_v7();
        let s3_key = format!("draft/{draft_id}/{attachment_id}");

        let size = i32::try_from(file.bytes.len()).map_err(|_| {
            anyhow::anyhow!(
                "attachment {} is too large to record ({} bytes)",
                file.file_name,
                file.bytes.len()
            )
        })?;
        let sha = hex::encode(Sha256::digest(&file.bytes));

        // `insert_draft_attachment` scopes its INSERT to a row owned by this
        // link, and inserts nothing when there is no match rather than
        // failing. Checking first turns that silent no-op — which would send
        // the email without the attachment, the exact bug this feature
        // exists to fix — into an error the caller has to handle.
        if !email_db_client::messages::get::draft_exists_with_id(&self.db, link_id, draft_id)
            .await?
        {
            anyhow::bail!("draft {draft_id} does not exist on link {link_id}");
        }

        // Bytes first: the send path fails the whole message on a row whose
        // object is missing, so a row must never outrun its content.
        self.s3.put(&self.bucket, &s3_key, &file.bytes).await?;

        email_db_client::attachments::draft::insert_draft_attachment(
            &self.db,
            link_id,
            service::attachment::AttachmentDraft {
                id: attachment_id,
                draft_id,
                file_name: file.file_name,
                content_type: file.content_type,
                sha,
                size,
                s3_key,
            },
        )
        .await?;

        Ok(attachment_id)
    }
}
