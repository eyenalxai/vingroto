# Notifications are split between the daemon and the TUI

Status: accepted

Supersedes [ADR-0008](0008-notifications-are-raised-by-the-tui.md).

New mail is announced once, by whichever process can best judge whether anyone needs interrupting.

- The daemon raises the alert over the freedesktop notification D-Bus service when a sync stores messages and no client is subscribed to its event stream. It applies the same guards as the TUI used to: the mailbox must be unmuted, the mailbox must have synced before, the mailbox-done must not be a reset, and notifications must be enabled. The enabled flag still lives in the daemon's config file because clients are stateless.
- The TUI raises the alert through the terminal whenever a client is subscribed, except when the terminal is focused (or its focus is unknown) on a list that already contains the mail and no search is running. Mail in another list, or any mail while searching, is announced even while the terminal is focused; a terminal that explicitly reports itself blurred is always announced.
- Focus is never the daemon's concern. A D-Bus notification is the only alert it can raise, and it raises one exactly when no terminal is attached to decide otherwise.

## Considered options

- **The TUI only (ADR-0008).** Rejected: the daemon keeps syncing while the client is closed, so mail that arrived in the meantime was never announced.
- **The daemon only.** Rejected: only the TUI can see terminal focus and the list on screen, and a desktop alert for mail already visible is noise.
- **Marking visibility in the daemon.** Rejected: the daemon does not know which list a client is showing, and clients are stateless by design; the client already knows.
- **Notifying while focused, or when the focus is unknown.** Rejected: an alert should only interrupt someone who is not already looking at the mail; unknown focus counts as focused.
