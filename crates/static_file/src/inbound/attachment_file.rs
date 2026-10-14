//! [`EntityFileService`] implementation for static files.
//!
//! A static file is already a file, so this projection is close to a
//! pass-through: fetch the bytes, keep the content type the store reports.
//! The only real work is inventing a file name, because the static file
//! service identifies files by id and does not record one.

use attachment::file::{EntityFile, EntityFileService, sanitize_file_name};
use attachment::{AttachmentError, ResolutionError};
use futures::future::join_all;
use macro_user_id::user_id::MacroUserIdStr;
use model_entity::{Entity, EntityType};

use crate::domain::ports::StaticFileRepo;

use super::attachment::StaticFileAttachmentService;

#[async_trait::async_trait]
impl<R: StaticFileRepo> EntityFileService for StaticFileAttachmentService<R> {
    #[tracing::instrument(skip_all)]
    async fn resolve_files(
        &self,
        _user_id: MacroUserIdStr<'_>,
        entities: &[Entity<'_>],
    ) -> Vec<Result<EntityFile, ResolutionError>> {
        join_all(entities.iter().map(|entity| async move {
            let owned_ref = entity
                .entity_type
                .with_entity_string(entity.entity_id.to_string());

            if entity.entity_type != EntityType::StaticFile {
                return Err(ResolutionError::new(
                    owned_ref,
                    AttachmentError::RoutingError(
                        "StaticFileAttachmentService".to_string(),
                        entity.entity_type,
                    ),
                ));
            }

            self.resolve_file(&entity.entity_id)
                .await
                .map_err(|error| ResolutionError::new(owned_ref, error))
        }))
        .await
    }
}

impl<R: StaticFileRepo> StaticFileAttachmentService<R> {
    #[tracing::instrument(skip(self), err)]
    async fn resolve_file(&self, file_id: &str) -> Result<EntityFile, AttachmentError> {
        let content_type = self
            .repo()
            .content_type(file_id)
            .await
            .map_err(AttachmentError::Internal)?;

        let bytes = self
            .repo()
            .read(file_id)
            .await
            .map_err(AttachmentError::Internal)?;

        if bytes.is_empty() {
            return Err(AttachmentError::NoContent);
        }

        Ok(EntityFile {
            reference: EntityType::StaticFile.with_entity_string(file_id.to_string()),
            file_name: format!(
                "{}.{}",
                sanitize_file_name(file_id),
                extension_for(&content_type)
            ),
            content_type: content_type.essence_str().to_string(),
            bytes,
        })
    }
}

/// Pick a file extension for a MIME type.
///
/// The subtype is the right answer often enough (`image/png`, `application/pdf`)
/// that it is the default, with the handful of subtypes that are not usable as
/// an extension mapped explicitly. Getting this wrong costs the recipient a
/// double-click, not the attachment.
fn extension_for(content_type: &mime::Mime) -> &str {
    match (
        content_type.type_().as_str(),
        content_type.subtype().as_str(),
    ) {
        ("text", "plain") => "txt",
        ("text", "markdown") => "md",
        ("image", "jpeg") => "jpg",
        ("image", "svg+xml") => "svg",
        ("application", "octet-stream") => "bin",
        (_, subtype) => subtype,
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn maps_awkward_subtypes_and_passes_the_rest_through() {
        assert_eq!(extension_for(&"text/plain".parse().unwrap()), "txt");
        assert_eq!(extension_for(&"image/jpeg".parse().unwrap()), "jpg");
        assert_eq!(extension_for(&"image/svg+xml".parse().unwrap()), "svg");
        assert_eq!(extension_for(&"application/pdf".parse().unwrap()), "pdf");
        assert_eq!(extension_for(&"image/png".parse().unwrap()), "png");
    }

    #[test]
    fn parameters_do_not_leak_into_the_extension() {
        assert_eq!(
            extension_for(&"text/plain; charset=utf-8".parse().unwrap()),
            "txt"
        );
    }
}
