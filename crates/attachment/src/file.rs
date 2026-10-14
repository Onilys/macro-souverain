//! Projecting an [`Entity`] into a real file.
//!
//! [`AttachmentService`](crate::AttachmentService) resolves an entity into
//! something an LLM can read — text and images, flattened into a prompt. This
//! module is the other projection of the same entity: the bytes a human
//! receives as a file, with the name and MIME type a mail client needs to
//! render it.
//!
//! The two are deliberately separate traits rather than one with a mode flag.
//! They disagree about what a successful resolution even is: a spreadsheet has
//! useful text for a model but no server-side export to a real file, so it
//! resolves for the AI and fails here. Keeping them apart lets each say no on
//! its own terms.

use macro_user_id::user_id::MacroUserIdStr;
use model_entity::Entity;

use crate::ResolutionError;

/// An entity resolved into a file: its bytes plus the metadata an email
/// attachment needs.
pub struct EntityFile {
    /// The entity these bytes came from.
    pub reference: Entity<'static>,
    /// File name including extension, e.g. `Q3 Plan.md`. Safe to use directly
    /// as a MIME part filename — [`sanitize_file_name`] has already run.
    pub file_name: String,
    /// MIME type, e.g. `application/pdf`.
    pub content_type: String,
    /// The file's contents.
    pub bytes: Vec<u8>,
}

// Manual impl: the bytes must never reach a log line.
impl std::fmt::Debug for EntityFile {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("EntityFile")
            .field("reference", &self.reference)
            .field("file_name", &self.file_name)
            .field("content_type", &self.content_type)
            .field("bytes", &format_args!("[{} bytes]", self.bytes.len()))
            .finish()
    }
}

/// Resolves [`Entity`] references into files.
///
/// Dyn-compatible on purpose: consumers hold one as `Arc<dyn
/// EntityFileService>` so adding an attachment source does not re-generify
/// every tool context it passes through.
#[async_trait::async_trait]
pub trait EntityFileService: Send + Sync + 'static {
    /// Resolve a batch of entities into files.
    ///
    /// Each entity is access-checked against `user_id`. Individual failures
    /// never fail the batch — they come back as [`ResolutionError`] entries,
    /// positionally aligned with `entities`, so a caller can report exactly
    /// which reference it could not attach.
    async fn resolve_files(
        &self,
        user_id: MacroUserIdStr<'_>,
        entities: &[Entity<'_>],
    ) -> Vec<Result<EntityFile, ResolutionError>>;
}

/// Strip characters that have meaning to a filesystem or a MIME header out of
/// an entity's display name, so it can be used as an attachment file name.
///
/// Entity names are free text — a document can legitimately be called
/// `Q3/Q4: plan`, and that must not turn into a path segment or break the
/// `Content-Disposition` header it gets written into.
pub fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();

    // Leading dots hide the file; trailing dots and spaces are stripped by
    // some clients, which would detach the extension we just appended.
    let trimmed = cleaned.trim().trim_start_matches('.').trim_end_matches('.');
    let trimmed = trimmed.trim();

    if trimmed.is_empty() {
        "attachment".to_owned()
    } else {
        trimmed.to_owned()
    }
}

/// Join a sanitized entity name to an extension, without doubling it when the
/// name already carries one (uploaded files keep their extension in the
/// document name; Macro-native documents do not).
pub fn file_name_with_extension(name: &str, extension: &str) -> String {
    let base = sanitize_file_name(name);
    let already_suffixed = base
        .rsplit_once('.')
        .is_some_and(|(_, suffix)| suffix.eq_ignore_ascii_case(extension));

    if already_suffixed {
        base
    } else {
        format!("{base}.{extension}")
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn strips_path_and_header_characters() {
        assert_eq!(sanitize_file_name("Q3/Q4: plan"), "Q3-Q4- plan");
        // No separator survives, so the name can never become a path.
        assert_eq!(sanitize_file_name("../../etc/passwd"), "-..-etc-passwd");
    }

    #[test]
    fn empty_or_punctuation_only_names_get_a_fallback() {
        assert_eq!(sanitize_file_name("   "), "attachment");
        assert_eq!(sanitize_file_name("..."), "attachment");
    }

    #[test]
    fn appends_extension_only_when_missing() {
        assert_eq!(file_name_with_extension("Q3 Plan", "md"), "Q3 Plan.md");
        assert_eq!(file_name_with_extension("report.pdf", "pdf"), "report.pdf");
        assert_eq!(file_name_with_extension("report.PDF", "pdf"), "report.PDF");
        assert_eq!(
            file_name_with_extension("v1.2 notes", "md"),
            "v1.2 notes.md"
        );
    }
}
