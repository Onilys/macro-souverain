use std::sync::Mutex;

use ai_usage::UsageContext;
use jev::domain::{JevError, Probability, YesNoClassifier, YesNoQuestion};
use macro_user_id::user_id::MacroUserIdStr;
use serde_json::{Value, json};

use super::{AutoModelSelector, DefaultAutoModel, ESCALATED_MODEL, JevAutoModel};

const DEEPSEEK: &str = "fireworks/deepseek-v4p1-flash-1017";

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
    let selector = JevAutoModel::new(FakeClassifier::answering(Ok(vec![0.9])));

    let model = selector
        .select(&owner(), "Prove the scheduler cannot deadlock")
        .await;

    assert_eq!(model, ESCALATED_MODEL);
    assert_eq!(ESCALATED_MODEL, "anthropic/claude-opus-5-5");
    let seen = selector.classifier.seen.lock().unwrap();
    assert_eq!(
        seen[0].0,
        json!({ "request": "Prove the scheduler cannot deadlock" })
    );
    assert_eq!(seen[0].1.len(), 1);
}

#[tokio::test]
async fn an_easy_prompt_stays_on_deepseek() {
    let selector = JevAutoModel::new(FakeClassifier::answering(Ok(vec![0.1])));

    assert_eq!(selector.select(&owner(), "hi").await, DEEPSEEK);
}

#[tokio::test]
async fn a_failed_classification_stays_on_deepseek() {
    let selector = JevAutoModel::new(FakeClassifier::answering(Err(JevError::Unavailable)));

    assert_eq!(selector.select(&owner(), "hi").await, DEEPSEEK);
}

#[tokio::test]
async fn without_a_classifier_auto_is_deepseek() {
    assert_eq!(DefaultAutoModel.select(&owner(), "hi").await, DEEPSEEK);
}
