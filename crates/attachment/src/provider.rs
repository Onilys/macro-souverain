//! Attachment provider — routes [`Entity`] references to the correct
//! [`AttachmentService`] by [`EntityType`].

use macro_user_id::user_id::MacroUserIdStr;
use model_entity::{Entity, EntityType};
use non_empty::NonEmpty;

use crate::file::{EntityFile, EntityFileService};
use crate::{AttachmentContent, AttachmentError, AttachmentService, Attachments, ResolutionError};

/// Routes [`Entity`] references to per-type [`AttachmentService`] implementations.
pub struct AttachmentProvider<Doc, Email, Chat, Chan, Sf> {
    /// Resolves [`EntityType::Document`] references.
    pub document: Doc,
    /// Resolves [`EntityType::EmailThread`] references.
    pub email_thread: Email,
    /// Resolves [`EntityType::Chat`] references.
    pub chat: Chat,
    /// Resolves [`EntityType::Channel`] references.
    pub channel: Chan,
    /// Resolves [`EntityType::StaticFile`] references.
    pub static_file: Sf,
}

impl<Doc, Email, Chat, Chan, Sf> AttachmentService
    for AttachmentProvider<Doc, Email, Chat, Chan, Sf>
where
    Doc: AttachmentService,
    Email: AttachmentService,
    Chat: AttachmentService,
    Chan: AttachmentService,
    Sf: AttachmentService,
{
    async fn resolve_attachments<'a>(
        &self,
        user_id: MacroUserIdStr<'_>,
        ids: NonEmpty<&[&'a Entity<'a>]>,
    ) -> Attachments<'a> {
        let mut doc = Vec::new();
        let mut email = Vec::new();
        let mut chat = Vec::new();
        let mut chan = Vec::new();
        let mut sf = Vec::new();

        for &entity in ids.iter() {
            match entity.entity_type {
                EntityType::Document | EntityType::Project | EntityType::Skill => doc.push(entity),
                EntityType::StaticFile => sf.push(entity),
                EntityType::EmailThread => email.push(entity),
                EntityType::Chat => chat.push(entity),
                EntityType::Channel => chan.push(entity),
                _ => {}
            }
        }

        let (a, b, c, d, e) = futures::join!(
            dispatch(&self.document, user_id.clone(), &doc),
            dispatch(&self.email_thread, user_id.clone(), &email),
            dispatch(&self.chat, user_id.clone(), &chat),
            dispatch(&self.channel, user_id.clone(), &chan),
            dispatch(&self.static_file, user_id, &sf),
        );

        let mut results = Vec::with_capacity(a.len() + b.len() + c.len() + d.len() + e.len());
        results.extend(a);
        results.extend(b);
        results.extend(c);
        results.extend(d);
        results.extend(e);

        Attachments::new(NonEmpty::new(results).expect("entities was non-empty"))
    }
}

/// Routes [`Entity`] references to per-type [`EntityFileService`]
/// implementations.
///
/// Only the entity kinds that are already stored as files have a resolver.
/// Everything else is answered here with
/// [`AttachmentError::NotFileBacked`] rather than being silently dropped —
/// the caller is expected to tell the user which reference it could not
/// attach.
pub struct EntityFileProvider<Doc, Sf> {
    /// Resolves [`EntityType::Document`] references.
    pub document: Doc,
    /// Resolves [`EntityType::StaticFile`] references.
    pub static_file: Sf,
}

#[async_trait::async_trait]
impl<Doc, Sf> EntityFileService for EntityFileProvider<Doc, Sf>
where
    Doc: EntityFileService,
    Sf: EntityFileService,
{
    async fn resolve_files(
        &self,
        user_id: MacroUserIdStr<'_>,
        entities: &[Entity<'_>],
    ) -> Vec<Result<EntityFile, ResolutionError>> {
        // Resolve each backing service once for the whole batch, then put the
        // results back in the caller's order. A caller reports failures against
        // the reference the user wrote, so position has to survive the split.
        let mut doc = Vec::new();
        let mut sf = Vec::new();
        let mut unsupported = Vec::new();

        for (index, entity) in entities.iter().enumerate() {
            match entity.entity_type {
                EntityType::Document => doc.push((index, entity.clone())),
                EntityType::StaticFile => sf.push((index, entity.clone())),
                other => unsupported.push((
                    index,
                    ResolutionError::new(
                        other.with_entity_string(entity.entity_id.to_string()),
                        AttachmentError::NotFileBacked(other),
                    ),
                )),
            }
        }

        let doc_entities: Vec<Entity<'_>> = doc.iter().map(|(_, e)| e.clone()).collect();
        let sf_entities: Vec<Entity<'_>> = sf.iter().map(|(_, e)| e.clone()).collect();

        let (doc_results, sf_results) = futures::join!(
            dispatch_files(&self.document, user_id.clone(), &doc_entities),
            dispatch_files(&self.static_file, user_id, &sf_entities),
        );

        let mut slots: Vec<Option<Result<EntityFile, ResolutionError>>> =
            (0..entities.len()).map(|_| None).collect();
        for ((index, _), result) in doc.into_iter().zip(doc_results) {
            slots[index] = Some(result);
        }
        for ((index, _), result) in sf.into_iter().zip(sf_results) {
            slots[index] = Some(result);
        }
        for (index, error) in unsupported {
            slots[index] = Some(Err(error));
        }

        slots
            .into_iter()
            .map(|slot| slot.expect("every index was filled by exactly one branch"))
            .collect()
    }
}

async fn dispatch_files<S: EntityFileService>(
    service: &S,
    user_id: MacroUserIdStr<'_>,
    entities: &[Entity<'_>],
) -> Vec<Result<EntityFile, ResolutionError>> {
    if entities.is_empty() {
        return Vec::new();
    }
    service.resolve_files(user_id, entities).await
}

async fn dispatch<'a, S: AttachmentService>(
    service: &S,
    user_id: MacroUserIdStr<'_>,
    refs: &[&'a Entity<'a>],
) -> Vec<Result<AttachmentContent<'a>, ResolutionError>> {
    if refs.is_empty() {
        return Vec::new();
    }
    let ne = NonEmpty::new(refs).expect("checked non-empty");
    service
        .resolve_attachments(user_id, ne)
        .await
        .into_parts()
        .into_inner()
}

#[cfg(test)]
mod entity_file_test {
    use super::*;
    use crate::AttachmentError;

    /// Echoes each entity back as a file named after its id, so a test can
    /// tell which backing service produced which result.
    struct Echo(&'static str);

    #[async_trait::async_trait]
    impl EntityFileService for Echo {
        async fn resolve_files(
            &self,
            _user_id: MacroUserIdStr<'_>,
            entities: &[Entity<'_>],
        ) -> Vec<Result<EntityFile, ResolutionError>> {
            entities
                .iter()
                .map(|e| {
                    let reference = e.entity_type.with_entity_string(e.entity_id.to_string());
                    // "deny" stands in for a resolver that fails one entity
                    // out of a batch.
                    if e.entity_id == "deny" {
                        return Err(ResolutionError::new(reference, AttachmentError::NoContent));
                    }
                    Ok(EntityFile {
                        reference,
                        file_name: format!("{}-{}", self.0, e.entity_id),
                        content_type: "text/plain".to_owned(),
                        bytes: b"x".to_vec(),
                    })
                })
                .collect()
        }
    }

    fn provider() -> EntityFileProvider<Echo, Echo> {
        EntityFileProvider {
            document: Echo("doc"),
            static_file: Echo("sf"),
        }
    }

    fn test_user() -> MacroUserIdStr<'static> {
        MacroUserIdStr::try_from_email("user@example.com").expect("valid macro id")
    }

    fn entity(entity_type: EntityType, id: &str) -> Entity<'static> {
        entity_type.with_entity_string(id.to_owned())
    }

    /// The caller reports failures against the reference the user wrote, so
    /// results must come back in the order they were asked for even though
    /// the provider splits them across services by type.
    #[tokio::test]
    async fn results_keep_the_caller_order_across_services() {
        let entities = [
            entity(EntityType::Document, "a"),
            entity(EntityType::StaticFile, "b"),
            entity(EntityType::Chat, "c"),
            entity(EntityType::Document, "d"),
        ];

        let results = provider().resolve_files(test_user(), &entities).await;

        assert_eq!(results.len(), 4);
        assert_eq!(results[0].as_ref().unwrap().file_name, "doc-a");
        assert_eq!(results[1].as_ref().unwrap().file_name, "sf-b");
        assert!(matches!(
            results[2].as_ref().unwrap_err().error,
            AttachmentError::NotFileBacked(EntityType::Chat)
        ));
        assert_eq!(results[3].as_ref().unwrap().file_name, "doc-d");
    }

    /// A kind with no file form is refused by name rather than dropped —
    /// dropping it would send an email silently missing an attachment.
    #[tokio::test]
    async fn non_file_entities_are_refused_not_skipped() {
        let entities = [
            entity(EntityType::Chat, "c"),
            entity(EntityType::CalendarEvent, "e"),
        ];

        let results = provider().resolve_files(test_user(), &entities).await;

        assert_eq!(results.len(), 2);
        assert!(results.iter().all(|r| r.is_err()));
    }

    /// One failure inside a batch must not displace its neighbours.
    #[tokio::test]
    async fn a_failure_keeps_its_slot() {
        let entities = [
            entity(EntityType::Document, "a"),
            entity(EntityType::Document, "deny"),
            entity(EntityType::StaticFile, "b"),
        ];

        let results = provider().resolve_files(test_user(), &entities).await;

        assert_eq!(results[0].as_ref().unwrap().file_name, "doc-a");
        assert_eq!(results[1].as_ref().unwrap_err().reference.entity_id, "deny");
        assert_eq!(results[2].as_ref().unwrap().file_name, "sf-b");
    }

    #[tokio::test]
    async fn an_empty_request_resolves_to_nothing() {
        let results = provider().resolve_files(test_user(), &[]).await;
        assert!(results.is_empty());
    }
}
