//! Small, content-free history owned by the host, independent of WebContent.

use std::collections::VecDeque;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

const CAPACITY: usize = 128;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "snake_case")]
pub enum ReloadReason {
    CacheReplacedAutomatic,
    UpdateAccepted,
    FailedLoadRecovery,
    UserRecovery,
    Logout,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "snake_case")]
pub enum SocketService {
    ConnectionGateway,
    Storage,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "snake_case")]
pub enum AgentPhase {
    Thinking,
    Writing,
    Working,
    Waiting,
}

/// Closed schema: never accept arbitrary text, URLs, or message content.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FrontendEvent {
    Started {
        previous_instance_id: Option<Uuid>,
    },
    Heartbeat {
        visible: bool,
        online: bool,
        last_scroll_age_ms: Option<u32>,
        last_interaction_age_ms: Option<u32>,
    },
    Visibility {
        visible: bool,
    },
    Connectivity {
        online: bool,
    },
    Channel {
        channel_id: Uuid,
        open: bool,
    },
    AgentActivity {
        session_id: Uuid,
        channel_id: Option<Uuid>,
        phase: AgentPhase,
        streaming: bool,
        active: bool,
    },
    SocketClosed {
        service: SocketService,
        code: u16,
        clean: bool,
    },
    SocketOpened {
        service: SocketService,
    },
    ReloadRequested {
        reload_id: Uuid,
        reason: ReloadReason,
    },
    /// Clears identifiers before another account can take over the WebView.
    AccountCleared,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum NativeEvent {
    #[cfg(any(mobile, test))]
    Foreground,
    #[cfg(any(mobile, test))]
    Background,
    #[cfg(any(target_os = "ios", test))]
    MemoryWarning,
    WebContentTerminated,
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(untagged)]
pub enum Event {
    Frontend(FrontendEvent),
    Native(NativeEvent),
}

#[derive(Clone, Debug, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticEvent {
    pub sequence: u32,
    // Milliseconds since epoch fit exactly in a JavaScript number.
    #[cfg_attr(test, specta(type = specta_typescript::Number))]
    pub timestamp_ms: u64,
    pub frontend_instance_id: Option<Uuid>,
    pub event: Event,
}

#[derive(Clone, Default, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct EventSnapshot {
    pub events: Vec<DiagnosticEvent>,
    pub current_frontend_instance_id: Option<Uuid>,
    pub active_context: Vec<DiagnosticEvent>,
    pub heartbeat: Option<DiagnosticEvent>,
    pub dropped: u32,
    pub memory_warning_reporting: bool,
}

#[derive(Default)]
pub struct EventBuffer {
    sequence: u32,
    events: VecDeque<DiagnosticEvent>,
    heartbeat: Option<DiagnosticEvent>,
    active_context: VecDeque<DiagnosticEvent>,
    frontend: Option<Uuid>,
    retired_frontend: Option<Uuid>,
    dropped: u32,
}

impl EventBuffer {
    pub fn frontend(&mut self, id: Uuid, event: FrontendEvent, timestamp_ms: u64) {
        if self.retired_frontend == Some(id)
            && !matches!(event, FrontendEvent::ReloadRequested { .. })
        {
            return;
        }
        if let FrontendEvent::Started {
            previous_instance_id,
        } = &event
        {
            // Compare against the snapshot read by this document. A delayed
            // start from a replaced document cannot reclaim the buffer.
            if self.frontend == Some(id) || *previous_instance_id != self.frontend {
                return;
            }
            self.frontend = Some(id);
            self.heartbeat = None;
            self.active_context.clear();
        } else if self.frontend != Some(id) {
            // A delayed IPC from the replaced document cannot overwrite its successor.
            return;
        }
        if matches!(event, FrontendEvent::AccountCleared) {
            self.events.clear();
            self.heartbeat = None;
            self.active_context.clear();
            self.retired_frontend = Some(id);
            self.dropped = 0;
        }
        let heartbeat = matches!(event, FrontendEvent::Heartbeat { .. });
        let entry = self.entry(Some(id), Event::Frontend(event), timestamp_ms);
        let active = match &entry.event {
            Event::Frontend(FrontendEvent::Channel { channel_id, open }) => {
                self.active_context.retain(|entry| !matches!(&entry.event,
                    Event::Frontend(FrontendEvent::Channel { channel_id: previous, .. }) if previous == channel_id));
                *open
            }
            Event::Frontend(FrontendEvent::AgentActivity {
                session_id, active, ..
            }) => {
                self.active_context.retain(|entry| !matches!(&entry.event,
                    Event::Frontend(FrontendEvent::AgentActivity { session_id: previous, .. }) if previous == session_id));
                *active
            }
            _ => false,
        };
        if active {
            // Preserve current surface state even if the history wraps.
            if self.active_context.len() == 32 {
                self.active_context.pop_front();
            }
            self.active_context.push_back(entry.clone());
        }
        if heartbeat {
            self.heartbeat = Some(entry);
        } else {
            self.push(entry);
        }
    }

    pub fn native(&mut self, event: NativeEvent, timestamp_ms: u64) {
        let entry = self.entry(self.frontend, Event::Native(event), timestamp_ms);
        self.push(entry);
    }

    fn entry(
        &mut self,
        frontend_instance_id: Option<Uuid>,
        event: Event,
        timestamp_ms: u64,
    ) -> DiagnosticEvent {
        self.sequence = self.sequence.saturating_add(1);
        DiagnosticEvent {
            sequence: self.sequence,
            timestamp_ms,
            frontend_instance_id,
            event,
        }
    }

    fn push(&mut self, entry: DiagnosticEvent) {
        if self.events.len() == CAPACITY {
            self.events.pop_front();
            self.dropped = self.dropped.saturating_add(1);
        }
        self.events.push_back(entry);
    }

    pub fn snapshot(&self) -> EventSnapshot {
        EventSnapshot {
            events: self.events.iter().cloned().collect(),
            current_frontend_instance_id: self.frontend,
            active_context: self.active_context.iter().cloned().collect(),
            heartbeat: self.heartbeat.clone(),
            dropped: self.dropped,
            memory_warning_reporting: cfg!(target_os = "ios"),
        }
    }
}

#[cfg(test)]
mod test;
