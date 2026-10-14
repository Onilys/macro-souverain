//! [`EntityFileService`] implementation for documents — the file projection
//! of the same entities [`DocumentAttachmentService`] projects into AI text.
//!
//! A document is attachable when its bytes already exist somewhere we can
//! fetch them: an uploaded file in document storage, or a Macro-native
//! markdown document the lexical service can export. Macro's other native
//! formats (spreadsheets, canvases) have no server-side exporter, so they are
//! refused by name rather than attached as something they are not.

use std::str::FromStr;

use attachment::file::{EntityFile, EntityFileService, file_name_with_extension};
use attachment::{AttachmentError, ResolutionError};
use entity_access::domain::ports::EntityAccessService;
use futures::future::join_all;
use lexical_client::parse_markdown::MarkdownTarget;
use macro_user_id::user_id::MacroUserIdStr;
use model_entity::{Entity, EntityType};
use model_file_type::{FileAssociation, FileType};

use crate::domain::ports::DocumentService;

use super::service::{DocumentAttachmentService, fetch_url_bytes};

#[async_trait::async_trait]
impl<DSvc: DocumentService, ESvc: EntityAccessService> EntityFileService
    for DocumentAttachmentService<DSvc, ESvc>
{
    #[tracing::instrument(skip_all)]
    async fn resolve_files(
        &self,
        user_id: MacroUserIdStr<'_>,
        entities: &[Entity<'_>],
    ) -> Vec<Result<EntityFile, ResolutionError>> {
        let user_id = &user_id;
        join_all(entities.iter().map(|entity| async move {
            let owned_ref = entity
                .entity_type
                .with_entity_string(entity.entity_id.to_string());

            if entity.entity_type != EntityType::Document {
                return Err(ResolutionError::new(
                    owned_ref,
                    AttachmentError::RoutingError(
                        "DocumentAttachmentService".to_string(),
                        entity.entity_type,
                    ),
                ));
            }

            self.resolve_file(user_id, &entity.entity_id)
                .await
                .map_err(|error| ResolutionError::new(owned_ref, error))
        }))
        .await
    }
}

impl<DSvc: DocumentService, ESvc: EntityAccessService> DocumentAttachmentService<DSvc, ESvc> {
    #[tracing::instrument(skip(self), err)]
    async fn resolve_file(
        &self,
        user_id: &MacroUserIdStr<'_>,
        id: &str,
    ) -> Result<EntityFile, AttachmentError> {
        let receipt = self
            .entity_access_service
            .generate_entity_access_receipt(user_id, None, id, EntityType::Document)
            .await
            .map_err(|e| AttachmentError::PermissionDenied(Box::new(e)))?;

        let document = self
            .document_service
            .internal_get_basic_document(id)
            .await
            .map_err(|e| AttachmentError::Internal(e.into()))?;

        let file_type = document
            .file_type
            .as_ref()
            .ok_or(AttachmentError::UnknownFileType)
            .and_then(|ft| {
                FileType::from_str(ft).map_err(|_| AttachmentError::UnsupportedFileType(ft.clone()))
            })?;

        // Macro-native formats that live only in their own editor's state.
        // There is no server-side exporter for these, and attaching the raw
        // internal representation would be worse than refusing.
        if matches!(file_type, FileType::Spreadsheet | FileType::Canvas) {
            return Err(AttachmentError::UnsupportedFileType(file_type.to_string()));
        }

        let reference = EntityType::Document.with_entity_string(id.to_string());

        // Markdown documents are Macro-native too, but the lexical service
        // exports the same GitHub-flavored markdown the in-app "Download"
        // action produces, so the recipient gets the file a user would have
        // sent by hand.
        if matches!(file_type.macro_app_path(), FileAssociation::Md(_)) {
            let markdown = self
                .lexical_client
                .get_markdown(id, MarkdownTarget::External)
                .await
                .map_err(AttachmentError::Internal)?;

            if markdown.trim().is_empty() {
                return Err(AttachmentError::NoContent);
            }

            return Ok(EntityFile {
                reference,
                file_name: file_name_with_extension(&document.document_name, "md"),
                content_type: FileType::Md.mime_type().to_string(),
                bytes: markdown.into_bytes(),
            });
        }

        let url = self.presigned_url_for(&document, receipt).await?;
        let bytes = fetch_url_bytes(&url).await?;

        if bytes.is_empty() {
            return Err(AttachmentError::NoContent);
        }

        Ok(EntityFile {
            reference,
            file_name: file_name_with_extension(&document.document_name, file_type.as_str()),
            content_type: file_type.mime_type().to_string(),
            bytes,
        })
    }
}
