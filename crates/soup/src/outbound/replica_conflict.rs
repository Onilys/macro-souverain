use std::error::Error;

use crate::domain::models::SoupErr;

#[cfg(test)]
mod test;

/// `serialization_failure`: what a hot standby raises when it cancels a
/// statement to replay WAL ("canceling statement due to conflict with
/// recovery"). A read that hit it is safe to rerun, and the primary has no
/// replay to conflict with.
const SERIALIZATION_FAILURE: &str = "40001";

/// Whether a Soup read failed because the read replica cancelled it.
pub fn is_replica_read_conflict(error: &SoupErr) -> bool {
    match error {
        // Transparent variants forward `source()` past the wrapped error, so
        // walk the anyhow chain, which starts at the error itself.
        SoupErr::SoupDbErr(error) => error.chain().any(is_serialization_failure),
        other => std::iter::successors(Some(other as &(dyn Error + 'static)), |&cause| {
            cause.source()
        })
        .any(is_serialization_failure),
    }
}

fn is_serialization_failure(cause: &(dyn Error + 'static)) -> bool {
    cause
        .downcast_ref::<sqlx::Error>()
        .and_then(sqlx::Error::as_database_error)
        .and_then(|error| error.code())
        .is_some_and(|code| code == SERIALIZATION_FAILURE)
}
