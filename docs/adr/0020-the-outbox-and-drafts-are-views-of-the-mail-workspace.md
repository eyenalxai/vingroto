# The outbox and drafts are views of the mail workspace

Status: accepted

Pending messages and drafts are not a screen of their own. The left pane lists an Outbox row with the count of pending messages and a Drafts row with the count of drafts beside the mail views (ADR-0009); selecting one shows its entries in the message list pane and previews the selected entry in the reader pane. `ctrl+x o` and `ctrl+x d` focus those rows. The full-screen outbox screen is deleted.

The list pane already renders whatever the current list scope is, and the outbox is another scope — one whose rows live in the daemon's outbox and draft tables (ADR-0019) instead of the mail cache, so the client models it as a list scope that never reaches the server. That keeps one place for list behaviour, one navigation model, and the pending state visible next to the mail it belongs to; the countdown that changes every second lives in the list rows, where the send time is read.

## Considered options

- **The full-screen outbox screen.** Rejected: it duplicated the workspace's layout and keys, hid the mail behind a modal mode, and could not show a message next to its pending state.
- **A server-side list scope.** Rejected: `message.list` serves the mail cache and its rows carry mailbox UIDs, while outbox and draft rows are daemon tables with send times and attempts already served by `outbox.list` and `draft.list`. Making the server pretend they are mail would buy nothing.
