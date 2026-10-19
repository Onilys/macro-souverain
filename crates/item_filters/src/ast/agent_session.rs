use filter_ast::{ExpandFrame, Expr, FoldTree, TryExpandNode};
use model_owner::Owner;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{AgentSessionFilters, ast::ExpandErr};

/// The possible literal values in an agent session filter AST.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum AgentSessionLiteral {
    /// Opt this query into agent sessions at all.
    ///
    /// Agent sessions are **off by default** — a query that
    /// says nothing about them gets none, so adding them to Soup did not
    /// change what pre-existing Soup views return. Asking for specific ids
    /// or owners also counts as opting in.
    #[serde(rename = "inc")]
    Include,
    /// Filter by agent session id.
    #[serde(rename = "id")]
    Id(Uuid),
    /// Filter by the session's owner.
    #[serde(rename = "o")]
    Owner(Owner),
    /// Sessions a routine's unattended run created.
    #[serde(rename = "rr")]
    RoutineRun,
}

impl ExpandFrame<AgentSessionLiteral> for AgentSessionFilters {
    type Err = ExpandErr;

    fn expand_ast(
        filter_request: AgentSessionFilters,
    ) -> Result<Option<Expr<AgentSessionLiteral>>, Self::Err> {
        let AgentSessionFilters {
            include,
            ids,
            owners,
            exclude_routine_runs,
        } = filter_request;

        let include = include.then_some(Expr::val(AgentSessionLiteral::Include));

        let ids = ids
            .iter()
            .map(|s| Uuid::parse_str(s))
            .try_expand(|r| r.map(AgentSessionLiteral::Id), Expr::or)?;

        let owners = owners
            .iter()
            .map(|owner| Owner::from_principal_str(owner))
            .try_expand(|r| r.map(AgentSessionLiteral::Owner), Expr::or)?;

        let routine_runs =
            exclude_routine_runs.then(|| Expr::is_not(Expr::val(AgentSessionLiteral::RoutineRun)));

        Ok([include, ids, owners, routine_runs]
            .into_iter()
            .fold_with(Expr::and))
    }
}
