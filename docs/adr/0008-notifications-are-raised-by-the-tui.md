# New-mail notifications are raised by the TUI

Status: accepted

New mail is announced by the TUI, not the daemon: after a sync stores messages in an unmuted mailbox the TUI raises a desktop notification through the terminal's OSC 99 protocol, carrying the newest sender and subject and never any sound. It does so only while the terminal reports itself unfocused, and never for a mailbox whose first sync is still running nor for a mailbox-done the daemon marks as a reset — a mailbox dropped and re-imported after a UID validity change — so neither the initial import of a newly added mailbox nor the re-import of a reassigned one announces its whole window. The enabled flag lives in the daemon's config file because clients are stateless; the daemon itself never notifies.

## Considered options

- **Daemon-side notifications with notify-send.** Rejected: a daemon can run headless or on another machine, so it cannot know whether anyone is at the desktop, let alone focused on the terminal.
- **A notify-send fallback in the TUI.** Rejected: it would spawn a platform-specific process per notification and make notifications depend on system binaries; OSC 99 keeps this a pure terminal protocol. Terminals without OSC 99 simply do not notify.
- **Notifying while focused, or when the focus is unknown.** Rejected: an alert should only reach someone who has left the terminal; unknown focus counts as focused.
- **Announcing the messages of a mailbox's first sync.** Rejected: a first sync stores the whole initial window, so a newly added account would announce hundreds of old messages.
