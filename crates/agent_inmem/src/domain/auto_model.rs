//! Which model an Auto turn runs on.

use std::{future::Future, pin::Pin};

use ai_usage::{AiFeature, UsageContext};
use jev::domain::{YesNoClassifier, YesNoQuestion};
use macro_user_id::user_id::MacroUserIdStr;
use tracing::Instrument as _;

use super::models::resolve;

#[cfg(test)]
mod test;

/// The model a hard Auto prompt escalates to.
pub const ESCALATED_MODEL: &str = "anthropic/claude-opus-5-5";

/// The question Jev answers about the turn's prompt.
const QUESTION: &str = "Does answering this request require high intelligence: deep reasoning, \
     complex multi-step work, difficult code, or careful analysis?";

/// Jev's probability at or above which a prompt escalates.
const ESCALATION_THRESHOLD: f32 = 0.5;

/// Choose the routable model for one Auto turn from its prompt.
pub trait AutoModelSelector: Send + Sync {
    /// The model id the turn runs on. Never fails: an unavailable classifier
    /// keeps the turn on Auto's default model.
    fn select<'a>(
        &'a self,
        owner: &'a MacroUserIdStr<'static>,
        prompt: &'a str,
    ) -> Pin<Box<dyn Future<Output = &'static str> + Send + 'a>>;
}

/// Auto without a classifier: every turn runs on Auto's default model.
pub struct DefaultAutoModel;

impl AutoModelSelector for DefaultAutoModel {
    fn select<'a>(
        &'a self,
        _: &'a MacroUserIdStr<'static>,
        _: &'a str,
    ) -> Pin<Box<dyn Future<Output = &'static str> + Send + 'a>> {
        Box::pin(async { resolve(super::models::AUTO_MODEL) })
    }
}

/// Asks Jev whether the prompt needs high intelligence, and escalates to
/// [`ESCALATED_MODEL`] when it does.
pub struct JevAutoModel<Classifier> {
    classifier: Classifier,
}

impl<Classifier: YesNoClassifier> JevAutoModel<Classifier> {
    /// Compose with a metered classifier.
    pub fn new(classifier: Classifier) -> Self {
        Self { classifier }
    }
}

impl<Classifier: YesNoClassifier> AutoModelSelector for JevAutoModel<Classifier> {
    fn select<'a>(
        &'a self,
        owner: &'a MacroUserIdStr<'static>,
        prompt: &'a str,
    ) -> Pin<Box<dyn Future<Output = &'static str> + Send + 'a>> {
        Box::pin(async move {
            let span = tracing::info_span!(
                "agent.auto_model",
                agent.auto_model.probability = tracing::field::Empty,
                agent.auto_model.selected = tracing::field::Empty,
                agent.auto_model.outcome = tracing::field::Empty,
            );
            let question = YesNoQuestion::try_from(QUESTION).expect("the question is valid");
            let answer = self
                .classifier
                .classify(
                    UsageContext::new(AiFeature::AgentSession, owner.clone()),
                    &serde_json::json!({ "request": prompt }),
                    std::slice::from_ref(&question),
                )
                .instrument(span.clone())
                .await;
            let selected = match answer.as_deref() {
                Ok([probability]) => {
                    span.record("agent.auto_model.probability", probability.get());
                    span.record("agent.auto_model.outcome", "classified");
                    if probability.get() >= ESCALATION_THRESHOLD {
                        ESCALATED_MODEL
                    } else {
                        resolve(super::models::AUTO_MODEL)
                    }
                }
                Ok(_) | Err(_) => {
                    span.record("agent.auto_model.outcome", "unavailable");
                    let error = answer.as_ref().err();
                    span.in_scope(|| {
                        tracing::warn!(
                            ?error,
                            "Auto model classification failed; using the default"
                        );
                    });
                    resolve(super::models::AUTO_MODEL)
                }
            };
            span.record("agent.auto_model.selected", selected);
            selected
        })
    }
}
