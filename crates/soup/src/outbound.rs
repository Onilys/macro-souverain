/// PostgreSQL-backed soup repository implementation.
pub mod pg_soup_repo;
/// Classifies Soup reads cancelled by a read replica.
mod replica_conflict;

pub use replica_conflict::is_replica_read_conflict;
