//! Bounded retries for complete database transactions aborted by PostgreSQL.

use std::{error::Error, future::Future, time::Duration};

#[cfg(test)]
mod test;

/// Whether PostgreSQL positively identified a transaction it aborted for a
/// deadlock or serialization failure. Connection and ambiguous commit failures
/// are deliberately excluded, since their effects may already have committed.
pub fn is_transaction_conflict(mut error: &(dyn Error + 'static)) -> bool {
    loop {
        if let Some(sqlx::Error::Database(database)) = error.downcast_ref::<sqlx::Error>() {
            return matches!(database.code().as_deref(), Some("40P01" | "40001"));
        }
        if let Some(database) = error.downcast_ref::<sqlx::postgres::PgDatabaseError>() {
            return matches!(database.code(), "40P01" | "40001");
        }
        match error.source() {
            Some(source) => error = source,
            None => return false,
        }
    }
}

/// Run a transaction at most four times, retrying only confirmed conflicts.
///
/// Each invocation must contain a complete transaction, from begin through
/// commit, or a single autocommit statement. Keep external side effects outside;
/// a failed attempt is rolled back before the next invocation. The classifier
/// lets adapters retain their existing typed errors and error context.
pub async fn on_conflict<T, E, F, Fut>(
    mut transaction: F,
    is_conflict: impl Fn(&E) -> bool,
) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, E>>,
{
    for attempt in 0..4 {
        match transaction().await {
            Err(error) if attempt < 3 && is_conflict(&error) => {
                tracing::warn!(
                    attempt = attempt + 1,
                    "retrying aborted database transaction"
                );
                tokio::time::sleep(Duration::from_millis(25 << attempt)).await;
            }
            result => return result,
        }
    }
    unreachable!("the final attempt returns its result")
}
