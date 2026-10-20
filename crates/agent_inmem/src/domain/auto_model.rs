//! Which model an Auto turn runs on.

use std::{future::Future, pin::Pin};

use ai_usage::{AiFeature, UsageContext};
use jev::domain::{YesNoClassifier, YesNoQuestion};
use macro_user_id::user_id::MacroUserIdStr;
use tracing::Instrument as _;

use super::models::resolve;

#[cfg(test)]
mod test;

/// The model a prompt needing high intelligence runs on.
pub const HIGH_MODEL: &str = "anthropic/claude-opus-5-5";

/// The model a prompt that is neither hard nor simple runs on.
pub const MID_MODEL: &str = "openai/gpt-6.1-sol";

/// Asked first: a yes runs the turn on [`HIGH_MODEL`].
const HIGH_QUESTION: &str = "Does answering this request require high intelligence: deep \
     reasoning, complex multi-step work, difficult code, or careful analysis?";

/// Asked alongside: a yes, without a yes to [`HIGH_QUESTION`], keeps the turn
/// on Auto's default model; a no runs it on [`MID_MODEL`].
const LOW_QUESTION: &str = "Is this request simple enough for a small, fast model: a greeting, \
     small talk, a quick factual lookup, or a single small action like renaming, tagging, or \
     moving one item?";

/// Jev's probability at or above which a question counts as yes.
const YES_THRESHOLD: f32 = 0.5;

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

/// Asks Jev how much intelligence the prompt needs: [`HIGH_MODEL`] for hard
/// prompts, Auto's default for simple ones, [`MID_MODEL`] otherwise.
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
                agent.auto_model.high = tracing::field::Empty,
                agent.auto_model.low = tracing::field::Empty,
                agent.auto_model.selected = tracing::field::Empty,
                agent.auto_model.outcome = tracing::field::Empty,
            );
            let questions = [HIGH_QUESTION, LOW_QUESTION].map(|question| {
                YesNoQuestion::try_from(question).expect("the questions are valid")
            });
            let answer = self
                .classifier
                .classify(
                    UsageContext::new(AiFeature::AgentSession, owner.clone()),
                    &serde_json::json!({ "request": prompt }),
                    &questions,
                )
                .instrument(span.clone())
                .await;
            let selected = match answer.as_deref() {
                Ok([high, low]) => {
                    span.record("agent.auto_model.high", high.get());
                    span.record("agent.auto_model.low", low.get());
                    span.record("agent.auto_model.outcome", "classified");
                    if high.get() >= YES_THRESHOLD {
                        HIGH_MODEL
                    } else if low.get() >= YES_THRESHOLD {
                        resolve(super::models::AUTO_MODEL)
                    } else {
                        MID_MODEL
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
