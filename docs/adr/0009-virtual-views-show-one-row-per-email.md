# Virtual views show one row per email

The virtual views — All emails, All unread, globally and per account — show one row per email even when an account caches that email in several mailboxes, and their unread totals count each email once. An email's identity is its account and its RFC Message-ID; rows without a Message-ID stay unique, keyed by their row id. The copy a view shows is chosen deterministically: Inbox first, then an unmuted mailbox that is not All Mail, then All Mail, then anything else, with the lowest mailbox id and lowest UID breaking ties. Per-mailbox message lists and per-mailbox counts keep showing and counting every cached copy, because each copy carries the mailbox-specific UID that actions need. Read state belongs to the email as well: marking a copy read or unread updates every cached copy in that account, on the server and in the cache. Folder membership stays per copy, which is why moving still acts on the copy the list selected.

## Considered options

- **Deduplicate on the client.** Rejected: the server limit would still be spent on copies, so a page could return fewer emails than asked, and the unread totals would stay wrong.
- **Store each email once and share it across mailboxes.** Rejected: every action — mark read, move, delete — needs the mailbox-specific UID, and per-mailbox lists stay per-mailbox.
- **Deduplicate by Message-ID across accounts.** Rejected: the same message delivered to two accounts is managed independently in each account, and a Message-ID is only unique within the account that stored it.
- **Keep the most recently dated copy as the representative.** Rejected: copies of a Gmail email share the same date, so the choice would be arbitrary and could move between syncs.
