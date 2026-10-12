use std::{borrow::Cow, fmt};

use sqlx::error::{DatabaseError, ErrorKind};

use super::*;

#[derive(Debug)]
struct PgError {
    code: &'static str,
    message: &'static str,
}

impl fmt::Display for PgError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.message)
    }
}

impl Error for PgError {}

impl DatabaseError for PgError {
    fn message(&self) -> &str {
        self.message
    }

    fn code(&self) -> Option<Cow<'_, str>> {
        Some(Cow::Borrowed(self.code))
    }

    fn as_error(&self) -> &(dyn Error + Send + Sync + 'static) {
        self
    }

    fn as_error_mut(&mut self) -> &mut (dyn Error + Send + Sync + 'static) {
        self
    }

    fn into_error(self: Box<Self>) -> Box<dyn Error + Send + Sync + 'static> {
        self
    }

    fn kind(&self) -> ErrorKind {
        ErrorKind::Other
    }
}

fn database_error(code: &'static str, message: &'static str) -> sqlx::Error {
    sqlx::Error::Database(Box::new(PgError { code, message }))
}

fn recovery_conflict() -> sqlx::Error {
    database_error("40001", "canceling statement due to conflict with recovery")
}

#[test]
fn detects_a_recovery_conflict_from_the_soup_repository() {
    let error = SoupErr::SoupDbErr(anyhow::Error::from(recovery_conflict()));

    assert!(is_replica_read_conflict(&error));
}

#[test]
fn detects_a_recovery_conflict_under_added_context() {
    let error = SoupErr::SoupDbErr(
        anyhow::Error::from(recovery_conflict()).context("expanded soup query failed"),
    );

    assert!(is_replica_read_conflict(&error));
}

#[test]
fn ignores_other_database_errors() {
    for code in ["40P01", "57014", "23505"] {
        let error = SoupErr::SoupDbErr(anyhow::Error::from(database_error(code, "other")));
        assert!(!is_replica_read_conflict(&error), "SQLSTATE {code}");
    }
}

#[test]
fn ignores_errors_without_a_database_cause() {
    assert!(!is_replica_read_conflict(&SoupErr::SoupDbErr(
        anyhow::anyhow!("canceling statement due to conflict with recovery")
    )));
    assert!(!is_replica_read_conflict(&SoupErr::SoupDbErr(
        anyhow::Error::from(sqlx::Error::PoolTimedOut)
    )));
    assert!(!is_replica_read_conflict(&SoupErr::CommsErr));
}
