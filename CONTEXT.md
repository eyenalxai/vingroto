# vingroto

A terminal mail client: clients talk to a long-running daemon over a local HTTP API. The daemon owns the configuration, the OS keyring, the SQLite cache and every IMAP/SMTP connection.

## Language

**Account**:
A configured mail identity: label, optional sender name, email, IMAP and SMTP servers. Accounts are matched by email address, and an account's id is that address.
_Avoid_: Profile, login

**Mailbox**:
An IMAP mailbox on a server, cached locally with its path, delimiter, special-use flags, UID validity and read state.
_Avoid_: Folder

**Copy**:
One mailbox's cached row of an email: the row a mailbox-scoped action selects, and the mailbox-specific UID that actions inside that mailbox use. An email with several copies has one read state, while folder membership stays per copy.
_Avoid_: Duplicate

**View**:
A virtual list of messages that is not a mailbox: All emails and All unread, globally or for one account. A view shows one row per email even when the account caches it in several mailboxes, and unread totals count each email once.
_Avoid_: Virtual folder

**List scope**:
What the message list shows right now: a view or a mailbox.
_Avoid_: Filter

**Search**:
A filter over the current list scope: fuzzy local matching over cached mail plus remote IMAP matching in the same scope. A search never changes which list scope is selected.
_Avoid_: Find, filter

**Remote match**:
A message an IMAP search found for the current query. The daemon imports its envelope like a sync would and remembers it as a match, so it stays in the results even when its cached fields do not contain the query.

**Read on display**:
Marking a message read once its body is displayed in the reader. The message keeps its place in the current Unread view — marker cleared, counts already updated — until that view is visited again.

**Marked message**:
A message in the multi-select set that batch actions — read, unread, move — apply to.
_Avoid_: Tagged, checked

**Message**:
A cached mail header: UID, account, mailbox, subject, sender, date, flags, size and snippet.

**Message detail**:
A message's envelope fields: message-id, references, recipients, answered and draft state.

**Body**:
A message's parsed text and HTML parts. Fetched from the server on demand and cached; never part of a sync.

**Prefetch**:
The daemon's background fetching of bodies for unread messages in unmuted mailboxes. A body that fails once is skipped for the rest of the session.

**Mute**:
A mailbox marked to be excluded from the Unread views, from account and global unread totals, from prefetching and from notifications, while still showing its own unread count and staying listed and readable.

**Notification**:
A desktop alert about new mail, raised by the daemon over the D-Bus session bus when no client is attached and by the TUI through the terminal when one is. It never fires for a muted mailbox, a mailbox's first sync, or a UID-validity reset; the TUI stays silent while the terminal is focused and the mail is already in the shown list, announces while blurred or when the mail is elsewhere, and never carries sound.
_Avoid_: Alert, attention

**Count tone**:
Whether a mailbox-pane count draws attention (unread) or is quiet.
_Avoid_: Muted (that is the mailbox state)

**Sync**:
The daemon fetching new messages into the cache. A mailbox's first sync covers the last `sync.initialDays`; later syncs fetch only messages above its last seen UID. When a server reassigns a mailbox's UID validity, the cached messages are dropped and the mailbox is synced from the date window again.

**Discovery**:
Detecting a provider's IMAP and SMTP servers for an email address, in order: published provider configuration, DNS SRV records, hostname guess.
_Avoid_: Autoconfig

**Daemon**:
The process that owns the config file, the OS keyring, the database and every mail connection. It serves the API and syncs in the background.

**API**:
The daemon's HTTP interface, and the only way a client talks to it. The daemon serves its OpenAPI document beside the routes.

**Token**:
The local secret every API request carries. The daemon writes it to its runtime directory and clients read it there.
_Avoid_: Password (that is a mail credential)

**Client**:
Any process that talks to the daemon over the API: the TUI, the `api` command or a script. It is stateless: it never reads the config file, the keyring or the database.

**TUI**:
The interactive, full-screen client.
_Avoid_: UI, app
