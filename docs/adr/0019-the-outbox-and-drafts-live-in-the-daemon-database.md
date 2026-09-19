# The outbox and drafts live in the daemon database

Status: accepted

The outbox is a table in the daemon's SQLite database. `outbox.enqueue` inserts a message with `sendAt = now + send.delaySeconds`; a daemon worker sends every due message over SMTP and deletes the row first, then appends the Sent copy. A failed attempt increments `attempts`, stores the error and schedules the next try with exponential backoff of 5, 10, 20, 40, 80, 160 and 320 seconds, capped at ten minutes; when attempts reaches seven, the message stays visible as failed until `outbox.release` resets it or `outbox.cancel` moves it into the draft table. Drafts are daemon rows too: `draft.save` upserts one row and reopening a draft is a `draft.list` entry, not an IMAP fetch.

The queue lives in the daemon for the same reason every other byte of state does (ADR-0003): sending survives the client exiting, and the client stays stateless. The send delay is an undo window — for `send.delaySeconds` a message is a mutable row rather than a transmission already in flight, so cancelling is a move between two tables instead of an SMTP problem.

Drafts are local rows rather than messages in an IMAP Drafts mailbox. The cost is that another client's drafts never appear and a draft saved here is not visible there; the benefit is that saving is a single SQLite upsert instead of an IMAP upload that can half-succeed, produce duplicates, or depend on a Drafts mailbox the provider may not expose. The daemon is the only client that reads them, so the missing sync costs nothing.

A crash between SMTP accepting a message and the worker deleting its row can resend it: delivery is at-least-once, never exactly-once. SMTP offers no way to make acceptance and the row delete atomic, so the worker deletes first and accepts the window where an accepted message is still queued; a resend is recoverable, a lost message is not.

## Considered options

- **Sending from the client.** Rejected: the client would hold credentials and a live connection, a closed TUI would drop queued mail, and the undo window and retry policy would live in the process that exits.
- **An IMAP Drafts mailbox as the draft store.** Rejected: cross-client sync is the only gain, paid for with an upload on every save, duplicates after a partial write, and providers without a usable Drafts mailbox.
- **An in-memory queue with the delay.** Rejected: a restart or crash would lose accepted messages, and no process could list or release a failed one.
- **Unbounded retries.** Rejected: a message that cannot go out — bad credentials, a removed account, a server that is gone — would occupy the worker forever, so attempts stop at seven and the message waits for a person instead.
