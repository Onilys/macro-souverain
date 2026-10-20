use super::*;
use std::sync::Mutex;

use crate::domain::error::HarnessError;

#[derive(Default)]
struct InstructionsSource {
    text: Mutex<Option<String>>,
    owners: Mutex<Vec<MacroUserIdStr<'static>>>,
    fail: bool,
}

impl UserInstructions for InstructionsSource {
    async fn load(&self, owner: &MacroUserIdStr<'static>) -> Result<Option<String>> {
        self.owners.lock().unwrap().push(owner.clone());
        if self.fail {
            return Err(HarnessError::PromptComposition(rootcause::report!(
                "instructions unavailable"
            )));
        }
        Ok(self.text.lock().unwrap().clone())
    }
}

struct Composer;

impl AgentPromptComposer for Composer {
    async fn compose(
        &self,
        prompt_markdown: &str,
        instructions: Option<&str>,
        _people: Option<&PromptPeople>,
        _trigger: Option<&TriggerContext>,
    ) -> Result<String> {
        Ok(format!(
            "{}\n{prompt_markdown}",
            instructions.unwrap_or_default()
        ))
    }
}

#[tokio::test]
async fn owner_preferences_reach_initial_and_followup_prompts_and_refresh_after_edits() {
    let source = InstructionsSource::default();
    *source.text.lock().unwrap() = Some("Answer in French.".into());
    let composer = UserInstructionsPromptComposer::new(source, Composer);
    let owner = MacroUserIdStr::try_from_email("owner@example.com").unwrap();
    let people = PromptPeople {
        owner: owner.clone(),
        sender: Some(MacroUserIdStr::try_from_email("collaborator@example.com").unwrap()),
    };

    let first = composer
        .compose(
            "Hello",
            Some("You are a calendar assistant."),
            Some(&people),
            None,
        )
        .await
        .unwrap();
    assert!(first.contains("Answer in French."));
    assert!(first.contains("You are a calendar assistant."));
    assert!(first.ends_with("\nHello"));

    // Follow-ups have no first-turn session instructions.
    *composer.source.text.lock().unwrap() = Some("Answer in Spanish.".into());
    let followup = composer
        .compose("Again", None, Some(&people), None)
        .await
        .unwrap();
    assert!(followup.contains("Answer in Spanish."));
    assert!(!followup.contains("French"));

    // Clearing or deleting the document takes effect without a new session.
    *composer.source.text.lock().unwrap() = None;
    assert_eq!(
        composer
            .compose("Again", None, Some(&people), None)
            .await
            .unwrap(),
        "\nAgain"
    );
    assert_eq!(
        *composer.source.owners.lock().unwrap(),
        vec![owner.clone(), owner.clone(), owner]
    );
}

#[tokio::test]
async fn absent_and_blank_preferences_preserve_existing_instructions() {
    for saved in [None, Some(" \n\t".to_owned())] {
        let source = InstructionsSource::default();
        *source.text.lock().unwrap() = saved;
        let composer = UserInstructionsPromptComposer::new(source, Composer);
        let people = PromptPeople {
            owner: MacroUserIdStr::try_from_email("owner@example.com").unwrap(),
            sender: None,
        };
        assert_eq!(
            composer
                .compose("Hello", Some("Session instructions"), Some(&people), None)
                .await
                .unwrap(),
            "Session instructions\nHello"
        );
    }
}

#[tokio::test]
async fn non_user_owned_sessions_do_not_read_personal_instructions() {
    let composer = UserInstructionsPromptComposer::new(InstructionsSource::default(), Composer);
    assert_eq!(
        composer.compose("Hello", None, None, None).await.unwrap(),
        "\nHello"
    );
    assert!(composer.source.owners.lock().unwrap().is_empty());
}

#[tokio::test]
async fn a_failed_read_does_not_silently_discard_user_instructions() {
    let composer = UserInstructionsPromptComposer::new(
        InstructionsSource {
            fail: true,
            ..InstructionsSource::default()
        },
        Composer,
    );
    let people = PromptPeople {
        owner: MacroUserIdStr::try_from_email("owner@example.com").unwrap(),
        sender: None,
    };
    assert!(matches!(
        composer.compose("Hello", None, Some(&people), None).await,
        Err(HarnessError::PromptComposition(_))
    ));
}
