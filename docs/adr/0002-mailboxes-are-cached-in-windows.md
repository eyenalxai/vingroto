# Mailboxes are cached in windows, not mirrored

A mailbox is never mirrored in full. Its first sync covers a date window (`sync.initialDays`); later syncs fetch only messages above its last seen UID; when the server reassigns UID validity, the cached messages are dropped and the mailbox is rebuilt from the date window. Bodies are fetched on demand and prefetched for unread mail, never during sync.

This keeps the cache proportional to what the user actually reads, makes every sync bounded and resumable, and avoids holding an IMAP connection per mailbox.

## Considered options

- **Full mirror of every mailbox.** Unbounded first fetch and cache growth for mail the user never opens.
- **IMAP IDLE per mailbox.** One long-lived connection each, and the cache still needs the same windowing to stay bounded.
