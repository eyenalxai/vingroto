# vingroto

A terminal mail client: clients talk to a long-running daemon over a local HTTP API. The daemon owns the configuration, the OS keyring, the SQLite cache and every IMAP/SMTP connection.

## Language

**Account**:
A configured mail identity: label, optional sender name, email, IMAP and SMTP servers. Accounts are matched by email address, and an account's id is that address.
_Avoid_: Profile, login

**Mailbox**:
An IMAP mailbox on a server, cached locally with its path, delimiter, special-use flags, UID validity and read state.
_Avoid_: Folder

**View**:
A virtual list of messages that is not a mailbox: All emails and All unread, globally or for one account.
_Avoid_: Virtual folder

**List scope**:
What the message list shows right now: a view or a mailbox.
_Avoid_: Filter

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
A mailbox marked to be excluded from the Unread views, from account and global unread totals and from prefetching, while still showing its own unread count and staying listed and readable.

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
