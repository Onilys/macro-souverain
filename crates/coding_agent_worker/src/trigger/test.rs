use super::*;
use agent_trigger::domain::broker_events::{
    AgentAssignedToTaskEvent, AgentBotMentionedEvent, AgentMentionedEvent, ChannelEventMetadata,
    ExistingAgentSessionEvent, NewAgentSessionEvent, ThreadEventMetadata, ThreadMessageKind,
};
use channel_sender::ChannelSender;
use channels::domain::broker_events::ChannelMessagePostedMetadata;
use channels::domain::models::ChannelType;
use chrono::Utc;
use messages::domain::events::MessagePostedMetadata;
use messages::domain::models::MessageParent;
use std::sync::Mutex;
use trigger_context::{
    AddressedBy, ContextMessage, ContextPerson, ContextThread, DiscussionContext,
    DiscussionSurface, FollowUpContext, ReplyTarget,
};

#[test]
fn repository_selection_survives_dispatch_and_older_events_still_decode() {
    let mut wire = serde_json::json!({"bot_id": bot_id::BotId::TEST_A, "session_id": test_session(), "owner": sender().to_string()});
    let old: AgentSessionRequestedEvent = serde_json::from_value(wire.clone()).unwrap();
    assert!(old.repo_url.is_none());
    wire["repo_url"] = serde_json::json!("https://github.com/org/project");
    let event: AgentSessionRequestedEvent = serde_json::from_value(wire).unwrap();
    let work = trigger_to_work(AgentTriggerTopicEvent::New(
        NewAgentSessionEvent::Requested(event),
    ))
    .unwrap();
    assert!(
        matches!(work, TriggerWork::OpenRequested { repo_url: Some(url), .. } if url == "https://github.com/org/project")
    );
}

fn test_session() -> AgentSessionId {
    AgentSessionId::new_from_uuid(Uuid::from_u128(0xA))
}

fn sender() -> MacroUserIdStr<'static> {
    MacroUserIdStr::try_from_email("asker@example.com").unwrap()
}

/// A channel post in the channel-only shape channel triggers travel in.
fn message(content: &str, thread_id: Option<Uuid>) -> ChannelMessagePostedMetadata {
    ChannelMessagePostedMetadata {
        channel_id: Uuid::from_u128(1),
        message_id: Uuid::from_u128(2),
        thread_id,
        sender: ChannelSender::new_from_user(sender()),
        triggered_by: None,
        channel_type: ChannelType::Public,
        content: content.to_owned(),
        mentions: vec![],
        attachments: vec![],
        created_at: Utc::now(),
    }
}

fn document() -> MessageParent {
    MessageParent::parse("document", "doc-1").unwrap()
}

fn document_message(content: &str, thread_id: Option<Uuid>) -> MessagePostedMetadata {
    MessagePostedMetadata {
        parent: document(),
        message_id: Uuid::from_u128(2),
        thread_id,
        root_id: thread_id.unwrap_or(Uuid::from_u128(2)),
        sender: ChannelSender::new_from_user(sender()),
        triggered_by: None,
        content: content.to_owned(),
        mentions: vec![],
        attachments: vec![],
        created_at: Utc::now(),
    }
}

fn mention(content: &str) -> AgentTriggerTopicEvent {
    AgentTriggerTopicEvent::New(NewAgentSessionEvent::TopLevelMentioned(
        AgentBotMentionedEvent {
            bot_id: bot_id::BotId::TEST_A,
            message: message(content, None),
            context: None,
        },
    ))
}

fn follow_up(content: &str) -> AgentTriggerTopicEvent {
    AgentTriggerTopicEvent::Existing(ExistingAgentSessionEvent::Channel(ChannelEventMetadata {
        bot_id: bot_id::BotId::TEST_A,
        session_id: test_session(),
        kind: ThreadMessageKind::MentionThread,
        message: message(content, Some(Uuid::from_u128(7))),
        context: None,
    }))
}

/// Document triggers arrive in the parent-aware shape and become the same
/// work as channel ones, addressed to the document.
#[test]
fn document_triggers_become_work_on_the_document() {
    let opened =
        AgentTriggerTopicEvent::New(NewAgentSessionEvent::Mentioned(AgentMentionedEvent {
            bot_id: bot_id::BotId::TEST_A,
            message: document_message("summarize this", None),
            context: None,
        }));
    assert_eq!(
        trigger_to_work(opened).expect("a document mention is work"),
        TriggerWork::OpenAndPrompt {
            reuse_origin_message: false,
            bot: bot_id::BotId::TEST_A,
            sender: sender(),
            parent: document(),
            thread_id: Uuid::from_u128(2),
            message_id: Uuid::from_u128(2),
            content: "summarize this".to_owned(),
            context: None,
        }
    );
    let followed =
        AgentTriggerTopicEvent::Existing(ExistingAgentSessionEvent::Thread(ThreadEventMetadata {
            bot_id: bot_id::BotId::TEST_A,
            session_id: test_session(),
            kind: ThreadMessageKind::Inferred,
            message: document_message("and this", Some(Uuid::from_u128(7))),
            context: None,
        }));
    assert_eq!(
        trigger_to_work(followed).expect("a document follow-up is work"),
        TriggerWork::PromptExisting {
            session: test_session(),
            sender: sender(),
            content: "and this".to_owned(),
            context: None,
        }
    );
}

#[test]
fn a_task_assignment_opens_and_prompts_in_the_task_discussion() {
    let event = AgentTriggerTopicEvent::New(NewAgentSessionEvent::AssignedToTask(
        AgentAssignedToTaskEvent {
            bot_id: BotId::TEST_A,
            parent: document(),
            discussion_id: Uuid::from_u128(2),
            actor: sender(),
            prompt: "Complete the assigned task".to_owned(),
            context: None,
        },
    ));
    assert_eq!(
        trigger_to_work(event).expect("a task assignment is work"),
        TriggerWork::OpenAndPrompt {
            reuse_origin_message: true,
            bot: BotId::TEST_A,
            sender: sender(),
            parent: document(),
            thread_id: Uuid::from_u128(2),
            message_id: Uuid::from_u128(2),
            content: "Complete the assigned task".to_owned(),
            context: None,
        }
    );
}

#[test]
fn a_mention_becomes_open_and_prompt_rooting_its_own_thread() {
    let work = trigger_to_work(mention("fix the test")).expect("a mention is work");
    assert_eq!(
        work,
        TriggerWork::OpenAndPrompt {
            reuse_origin_message: false,
            bot: bot_id::BotId::TEST_A,
            sender: sender(),
            parent: messages::domain::models::MessageParent::Channel(Uuid::from_u128(1)),
            thread_id: Uuid::from_u128(2),
            message_id: Uuid::from_u128(2),
            content: "fix the test".to_owned(),
            context: None,
        }
    );
}

#[test]
fn a_follow_up_becomes_prompt_existing() {
    let work = trigger_to_work(follow_up("keep going")).expect("a follow-up is work");
    assert_eq!(
        work,
        TriggerWork::PromptExisting {
            session: test_session(),
            sender: sender(),
            content: "keep going".to_owned(),
            context: None,
        }
    );
}

/// The short prompt gets its meaning from earlier replies, even when the
/// composer has not inserted an explicit reply-target node.
fn reply_discussion() -> DiscussionContext {
    let root_id = Uuid::from_u128(7);
    let author = ContextPerson {
        id: sender().to_string(),
        name: "Asker".to_owned(),
        email: Some("asker@example.com".to_owned()),
    };
    DiscussionContext {
        surface: DiscussionSurface::Channel {
            id: Uuid::from_u128(1),
            name: Some("bugs".to_owned()),
            channel_type: trigger_context::ChannelType::Public,
        },
        prompt_message_id: Uuid::from_u128(2),
        sender: author.clone(),
        reply_target: ReplyTarget::Thread { root_id },
        thread: Some(ContextThread {
            root_id,
            messages: [
                (root_id, "The calendar stopped loading"),
                (Uuid::from_u128(8), "It happens after switching accounts"),
                (Uuid::from_u128(2), "please investigate"),
            ]
            .into_iter()
            .map(|(id, content)| ContextMessage {
                id,
                author: author.clone(),
                content: content.to_owned(),
                posted_at: Utc::now(),
            })
            .collect(),
            messages_omitted: false,
        }),
        channel: Vec::new(),
    }
}

#[tokio::test]
async fn short_mentions_keep_the_reply_chain_when_opening_or_following_up() {
    let discussion = reply_discussion();
    let opening_context = TriggerContext::Mentioned(discussion.clone());
    let follow_up_context = TriggerContext::FollowUp(FollowUpContext {
        addressed_by: AddressedBy::Mention,
        discussion,
    });
    let post = message("please investigate", Some(Uuid::from_u128(7)));
    let events = [
        AgentTriggerTopicEvent::New(NewAgentSessionEvent::TopLevelMentioned(
            AgentBotMentionedEvent {
                bot_id: BotId::TEST_A,
                message: post.clone(),
                context: Some(opening_context.clone()),
            },
        )),
        AgentTriggerTopicEvent::Existing(ExistingAgentSessionEvent::Channel(
            ChannelEventMetadata {
                bot_id: BotId::TEST_A,
                session_id: test_session(),
                kind: ThreadMessageKind::MentionThread,
                message: post,
                context: Some(follow_up_context.clone()),
            },
        )),
    ];
    let executor = std::sync::Arc::new(RecordingExecutor::default());
    for event in events {
        // Exercise the broker envelope the SSE listener decodes, too.
        let wire = serde_json::to_vec(&Event::new(event)).unwrap();
        let event: TriggerEvent = serde_json::from_slice(&wire).unwrap();
        handle_event(event, &executor).await.unwrap();
    }
    assert_eq!(
        *executor.executed.lock().unwrap(),
        vec![
            TriggerWork::OpenAndPrompt {
                reuse_origin_message: false,
                bot: BotId::TEST_A,
                sender: sender(),
                parent: MessageParent::Channel(Uuid::from_u128(1)),
                thread_id: Uuid::from_u128(7),
                message_id: Uuid::from_u128(2),
                content: "please investigate".to_owned(),
                context: Some(opening_context),
            },
            TriggerWork::PromptExisting {
                session: test_session(),
                sender: sender(),
                content: "please investigate".to_owned(),
                context: Some(follow_up_context),
            },
        ]
    );
}

#[tokio::test]
async fn the_control_request_carries_the_reply_chain_separately_from_the_short_prompt() {
    use crate::config::{HarnessCredentials, HarnessScope, MacroApi};
    use crate::outbound::agent_session::HarnessApi;
    use agent_session::inbound::axum_router::ControlRequest;
    use tokio::io::{AsyncBufReadExt as _, AsyncReadExt as _, AsyncWriteExt as _, BufReader};

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let api = HarnessApi::new(
        &MacroApi {
            api_url: format!("http://{}", listener.local_addr().unwrap()),
            storage_url: "http://unused".to_owned(),
            web_url: "http://unused".to_owned(),
        },
        &HarnessCredentials {
            harness_id: harness_id::HarnessId::TEST_A,
            token: "mhns_test".to_owned(),
            scope: HarnessScope::User,
        },
    );
    let server = tokio::spawn(async move {
        let (socket, _) = listener.accept().await.unwrap();
        let mut socket = BufReader::new(socket);
        let mut headers = String::new();
        loop {
            let mut line = String::new();
            assert_ne!(socket.read_line(&mut line).await.unwrap(), 0);
            if line == "\r\n" {
                break;
            }
            headers.push_str(&line);
        }
        assert!(headers.starts_with(&format!(
            "POST /agent-sessions/{}/control HTTP/1.1\r\n",
            test_session()
        )));
        assert!(headers.contains("x-macro-harness-token: mhns_test\r\n"));
        assert!(headers.contains("x-macro-harness-for-macro-user-id: macro|asker@example.com\r\n"));
        let length: usize = headers
            .lines()
            .find_map(|line| line.strip_prefix("content-length: "))
            .unwrap()
            .parse()
            .unwrap();
        let mut body = vec![0; length];
        socket.read_exact(&mut body).await.unwrap();
        let request: ControlRequest = serde_json::from_slice(&body).unwrap();
        socket
            .get_mut()
            .write_all(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n")
            .await
            .unwrap();
        request
    });
    let context = TriggerContext::Mentioned(reply_discussion());
    let request = tokio::time::timeout(std::time::Duration::from_secs(5), async {
        api.prompt(
            test_session(),
            &sender(),
            "please investigate",
            Some(context.clone()),
        )
        .await
        .unwrap();
        server.await.unwrap()
    })
    .await
    .expect("the prompt should reach the control endpoint");
    assert_eq!(request.context, Some(context));
    assert_eq!(
        request.action,
        agent_runtime_protocol::domain::action::AgentAction::prompt("please investigate")
    );
}

#[test]
fn a_bots_own_message_is_skipped() {
    let mut event = mention("self talk");
    if let AgentTriggerTopicEvent::New(NewAgentSessionEvent::TopLevelMentioned(mentioned)) =
        &mut event
    {
        mentioned.message.sender = ChannelSender::new_from_bot(bot_id::BotId::TEST_B);
    }
    assert_eq!(trigger_to_work(event), Err(Skipped::NotFromUser));
}

#[test]
fn trigger_filters_name_this_bot_and_every_trigger_event() {
    let filters = trigger_filters([bot_id::BotId::TEST_A]);
    assert_eq!(filters.len(), 1);
    let filter = &filters[0];
    assert_eq!(
        filter.events,
        vec![
            "agent_trigger.new".to_owned(),
            "agent_trigger.existing".to_owned()
        ]
    );
    assert_eq!(
        filter.ids.as_deref(),
        Some([bot_id::BotId::TEST_A.to_string()].as_slice())
    );
}

/// Records executed work instead of doing anything.
#[derive(Default)]
struct RecordingExecutor {
    executed: Mutex<Vec<TriggerWork>>,
    fail: bool,
}

impl WorkExecutor for std::sync::Arc<RecordingExecutor> {
    async fn execute(&self, work: TriggerWork) -> Result<(), crate::dispatch::DispatchError> {
        self.executed.lock().unwrap().push(work);
        if self.fail {
            return Err(crate::dispatch::DispatchError::Api(
                crate::outbound::agent_session::ApiError::Refused {
                    status: reqwest::StatusCode::INTERNAL_SERVER_ERROR,
                    message: "boom".to_owned(),
                },
            ));
        }
        Ok(())
    }
}

#[tokio::test]
async fn a_mention_event_executes() {
    let executor = std::sync::Arc::new(RecordingExecutor::default());

    handle_event(Event::new(mention("fix it")), &executor)
        .await
        .expect("a mention is work");

    assert_eq!(executor.executed.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn a_skipped_event_is_not_an_error() {
    let executor = std::sync::Arc::new(RecordingExecutor::default());
    let mut event = mention("self talk");
    if let AgentTriggerTopicEvent::New(NewAgentSessionEvent::TopLevelMentioned(mentioned)) =
        &mut event
    {
        mentioned.message.sender = ChannelSender::new_from_bot(bot_id::BotId::TEST_B);
    }

    handle_event(Event::new(event), &executor)
        .await
        .expect("skipped events are not errors");

    assert!(executor.executed.lock().unwrap().is_empty());
}

#[tokio::test]
async fn failed_work_is_returned() {
    let executor = std::sync::Arc::new(RecordingExecutor {
        fail: true,
        ..Default::default()
    });

    assert!(
        handle_event(Event::new(mention("fix it")), &executor)
            .await
            .is_err()
    );
}
