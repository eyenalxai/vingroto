# Sent copies are best effort

Status: accepted

A Sent copy is a convenience, not part of delivery: SMTP acceptance is what makes a send successful, and appending the copy afterwards never changes that outcome. `Outbox.sendEntry` deletes the outbox entry once SMTP accepts the message and only then calls `SentCopies.save`; a failure there is logged as a warning annotated with the account, the Sent mailbox and the reason, and the worker moves on to the next entry. No client sees it: an outbox entry that disappeared means the message was sent, whether or not its copy could be appended.

`SentCopies.save` reports the failures that mean no copy reached the server. `SentMailboxMissing` says the account's cache has no Sent mailbox; `SentCopyAppendFailed` says the IMAP append or its credentials failed, and carries the account, the mailbox path and the reason taken from the `ImapError` fields. The two steps before the append keep their own typed failures (`EffectDrizzleQueryError` when listing the mailbox, `SmtpError` when compiling the raw message), so the caller decides how to report each. A server that returns no UID and a local cache write that fails after the append are not errors: the message is already in the Sent mailbox, so the service warns internally and the next sync reconciles the cache.

## Considered options

- **Fail the send when the copy fails.** Rejected: the message was accepted by SMTP, so a copy failure after acceptance would resend a delivered message and turn a cosmetic loss into a duplicate.
- **Retry the copy.** Rejected: after an ambiguous append a retry can duplicate the Sent copy, and the outbox entry is already deleted, so there is no state left to retry from.
- **Expose a per-entry copy status.** Rejected: the entry is gone before the copy is attempted, so the status would need its own table, its own API and its own UI for something no client action could repair.
