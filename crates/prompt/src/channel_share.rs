//! Offer to share a chipped item with the channel a reply is posted in.
//!
//! The classic channel-mention bot carries the same rule in
//! [`crate::channel_mention`]. Agent sessions opened from a channel mention
//! stream their replies into that thread and must ask too; they use this
//! section because they do not load the channel-mention prompt.

use crate::types::StaticPrompt;

static TITLE: &str = "Channel Sharing";

static INSTRUCTIONS: &str = r##"- When the context block says the prompt was posted in a channel thread, and your reply chips something the other people in that channel may not already be able to open — a calendar event, document, chat, database, form, project, call, email thread, or agent session — end that reply with this question and nothing after it: "Do you want me to share this with the members of the channel?" Do not share it in that same turn. Name the thing only when "this" would be ambiguous. Skip the question when they already asked you to share it: call `ShareWithChannel` then, instead of asking. Do not offer to share the channel itself, a message already in this channel, or something you only mentioned in passing without a chip.

- A later message in this thread that agrees ("yes", "yeah", "please", "go ahead", "share it") answers that question. Call `ShareWithChannel` for that item and this channel — `channelId` is the `id` on the conversation parent above; a calendar chip is entity type `calendar_event` and its `documentId` is the event id — then reply with only "Okay." Do not repeat the earlier answer. Agreement to a different question is not agreement to share. If they decline, acknowledge in a few words and do not share. If the tool says you cannot share it, say that plainly instead of "Okay."
"##;

static INTENT: &str = "When a channel-thread reply chips an item the channel may \
not already see, the model ends by asking \"Do you want me to share this with the \
members of the channel?\" — then, on a yes in the thread, calls ShareWithChannel \
and replies only \"Okay.\"";

/// Channel-share offer for agent sessions whose replies stream into a thread.
pub static PROMPT: StaticPrompt<'static> = StaticPrompt::borrowed(TITLE, INSTRUCTIONS, INTENT);

#[cfg(test)]
mod test {
    use super::PROMPT;

    #[test]
    fn a_linked_item_is_offered_to_the_channel_and_shared_only_after_yes() {
        let instructions = PROMPT.instructions.as_ref();
        assert!(
            instructions.contains("Do you want me to share this with the members of the channel?")
        );
        assert!(instructions.contains("`ShareWithChannel`"));
        assert!(instructions.contains("reply with only \"Okay.\""));
        assert!(instructions.contains("calendar_event"));
        assert!(instructions.contains("posted in a channel thread"));
        assert!(PROMPT.intent.contains("ShareWithChannel"));
    }
}
