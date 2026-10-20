use std::sync::Mutex;

use ai_usage::UsageContext;
use jev::domain::{JevError, Probability, YesNoClassifier, YesNoQuestion};
use macro_user_id::user_id::MacroUserIdStr;
use serde_json::{Value, json};

use super::{AutoModelSelector, DefaultAutoModel, HIGH_MODEL, JevAutoModel, MID_MODEL};

const GEMINI: &str = "google/gemini-3.8-flash";

struct FakeClassifier {
    answer: Result<Vec<f32>, JevError>,
    seen: Mutex<Vec<(Value, Vec<String>)>>,
}

impl FakeClassifier {
    fn answering(answer: Result<Vec<f32>, JevError>) -> Self {
        Self {
            answer,
            seen: Mutex::default(),
        }
    }
}

impl YesNoClassifier for FakeClassifier {
    async fn classify(
        &self,
        _: UsageContext,
        input: &Value,
        questions: &[YesNoQuestion],
    ) -> Result<Vec<Probability>, JevError> {
        self.seen.lock().unwrap().push((
            input.clone(),
            questions
                .iter()
                .map(|question| question.as_str().to_owned())
                .collect(),
        ));
        Ok(self
            .answer
            .clone()?
            .into_iter()
            .map(|value| Probability::new(value).unwrap())
            .collect())
    }
}

fn owner() -> MacroUserIdStr<'static> {
    MacroUserIdStr::try_from_email("owner@macro.com").unwrap()
}

#[tokio::test]
async fn a_hard_prompt_escalates_to_opus() {
    let selector = JevAutoModel::new(FakeClassifier::answering(Ok(vec![0.9, 0.6])));

    let model = selector
        .select(&owner(), "Prove the scheduler cannot deadlock")
        .await;

    assert_eq!(model, HIGH_MODEL);
    assert_eq!(HIGH_MODEL, "anthropic/claude-opus-5-5");
    let seen = selector.classifier.seen.lock().unwrap();
    assert_eq!(
        seen[0].0,
        json!({ "request": "Prove the scheduler cannot deadlock" })
    );
    assert_eq!(seen[0].1.len(), 2);
}

#[tokio::test]
async fn a_simple_prompt_stays_on_gemini() {
    let selector = JevAutoModel::new(FakeClassifier::answering(Ok(vec![0.03, 0.98])));

    assert_eq!(selector.select(&owner(), "hi").await, GEMINI);
}

#[tokio::test]
async fn an_ordinary_prompt_runs_on_sol() {
    let selector = JevAutoModel::new(FakeClassifier::answering(Ok(vec![0.2, 0.3])));

    assert_eq!(
        selector.select(&owner(), "Summarize this doc").await,
        MID_MODEL
    );
    assert_eq!(MID_MODEL, "openai/gpt-6.1-sol");
}

#[tokio::test]
async fn a_short_answer_stays_on_gemini() {
    let selector = JevAutoModel::new(FakeClassifier::answering(Ok(vec![0.9])));

    assert_eq!(selector.select(&owner(), "hi").await, GEMINI);
}

#[tokio::test]
async fn a_failed_classification_stays_on_gemini() {
    let selector = JevAutoModel::new(FakeClassifier::answering(Err(JevError::Unavailable)));

    assert_eq!(selector.select(&owner(), "hi").await, GEMINI);
}

#[tokio::test]
async fn without_a_classifier_auto_is_gemini() {
    assert_eq!(DefaultAutoModel.select(&owner(), "hi").await, GEMINI);
}
