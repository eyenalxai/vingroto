# The wire protocol is camelCase and typed

Status: accepted

Wire payloads use camelCase keys. `Mailbox` was the one protocol model that mirrored its SQLite row (`account_id`, `special_use`, `uid_validity`, `last_seen_uid`, `synced_at`, `created_at`, `updated_at`) and now carries `accountId`, `specialUse`, `uidValidity`, `lastSeenUid`, `syncedAt`, `createdAt`, `updatedAt`. The Drizzle schema keeps snake_case columns, and the store maps rows to the protocol shape in `listMailboxes`, `getMailbox` and `listAccountMailboxes`; inserts and updates keep using the column names. The wire shape and the storage shape can then change independently, and the database's naming never leaks into JSON.

Outcome payloads (`SeenOutcome`, `MoveOutcome` and `SyncReport`) carry arrays of tagged failure structs instead of display strings. Each failure carries its `_tag`, the identifiers available where it was raised — the account, the mailbox path, the IMAP or keyring operation, the missing credential's reference, the count of unfound messages — and the message where the raising site had one. The daemon no longer picks words for a client it does not know; clients can group, count or filter failures by tag, and the one that renders a status line formats them. A site that cannot classify truthfully raises a named catch-all tag with its message rather than an invented operation.

## Considered options

- **Keeping the snake_case keys on the wire.** Rejected: the wire would keep the database's naming, the one mirrored model would stay coupled to its table, and any column rename would be a protocol break.
- **Returning a local row interface from the store and renaming in each consumer.** Rejected: the core `Mailbox` is exactly the columns the table stores, so a local interface would duplicate it and every read site would still see snake_case properties.
- **Naming the Drizzle properties in camelCase (`accountId: text("account_id")`) so rows come out in wire shape.** Rejected: the Drizzle schema would stop reading like the migration it was generated from, and the translation would be scattered across the table definition instead of the store boundary.
- **Keeping failures as human-readable strings.** Rejected: a client can only display them, the wording is fixed for every future consumer, and nothing can group or count a failure without parsing text.
- **One `Schema.TaggedError` per failure instead of tagged structs.** Rejected: these are outcome data, not failures of the operation — they are collected into arrays that cross the wire inside a success payload, and an error channel would carry them one at a time and lose the counts.
- **Classifying every sync failure down to its IMAP operation.** Rejected: the per-mailbox fetch already collapses its failure to a message before sync sees it, and the account-wide catch-all likewise; a catch-all `mailbox` or `sync` tag with the message is truthful, while an invented operation would be noise.
