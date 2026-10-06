# vingroto

A terminal mail client: clients talk to a long-running daemon over a local HTTP API. The daemon owns the configuration, credentials, cached mail and every mail connection.

## Language

**Account**:
A configured mail identity: label, optional sender name, email and mail servers. Accounts are matched by email address.
_Avoid_: Profile, login

**Sent copy**:
The copy of an outgoing message kept in the account's Sent mailbox. Each account decides whether it is kept.
_Avoid_: Outbox

**Send delay**:
How long an outgoing message waits before it is sent. Zero sends immediately.

**Outbox**:
Messages the daemon has accepted but has not sent yet: each waits out its send delay or retry backoff, and can be cancelled into a draft.
_Avoid_: Queue

**Pending message**:
One message in the outbox.
_Avoid_: Queued message, job

**Draft**:
A message stored by the daemon rather than on a mail server, so it survives client restarts and can be reopened in the composer.
_Avoid_: Drafts folder

**Composer**:
The full-screen editor for a new, replied or reopened message: the From, To/Cc/Bcc, subject and body fields, with draft autosave and a body edited by the built-in text area or the system editor. It never sends directly.
_Avoid_: Compose window, message window

**Editor**:
Which editor edits the composer body: the built-in text area or the system editor.
_Avoid_: Editor mode, external editor

**System editor**:
The external program the composer runs in place when the editor is the system editor.
_Avoid_: The editor (that is the setting)

**Settings section**:
One area of the settings screen: Accounts, Mailboxes, Composer, Sending, Sync or Notifications.
_Avoid_: Tab, page

**Settings group**:
A block inside a settings section, scoped to one account: its settings form or its mailboxes.
_Avoid_: Collapsible, accordion

**Mailbox**:
A mailbox on a mail server, as opposed to a view.
_Avoid_: Folder

**Copy**:
An email's presence in one mailbox, identified by that mailbox's UID. An email with several copies has one read state, but its mailbox membership is per copy.
_Avoid_: Duplicate

**View**:
A list that is not a mailbox: All emails, All unread — globally or for one account — plus the Outbox and the Drafts. A mail view shows one row per email and counts each email once, however many mailboxes hold it.
_Avoid_: Virtual folder

**List scope**:
What the message list shows right now: a view or a mailbox.
_Avoid_: Filter

**Search**:
A filter over the current list scope, matching both the locally known mail and mail the server reports. A search never changes which list scope is selected.
_Avoid_: Find, filter

**Remote match**:
A message the server's search returned that the locally known mail does not match, remembered so it stays in the results.

**Read on display**:
Marking a message read once its body is displayed in the reader. The message keeps its place in the current Unread view until that view is visited again.

**Marked message**:
A message in the multi-select set that batch actions — read, unread, move — apply to.
_Avoid_: Tagged, checked

**Message**:
A mail header as the daemon knows it: subject, sender, date, flags, size and snippet.

**Message detail**:
A message's extra envelope fields: message-id, references, recipients, answered and draft state.

**Body**:
A message's parsed text and HTML parts.

**Prefetch**:
The daemon fetching message bodies ahead of reading, for unread mail in unmuted mailboxes.

**Mute**:
A mailbox excluded from the Unread views, unread totals, prefetch and notifications, while still listed, readable and showing its own unread count.

**Notification**:
An alert about new mail. It never fires for mail that arrived already read, a muted mailbox, a mailbox's first sync or a UID-validity reset, and never carries sound.
_Avoid_: Alert, attention

**Count tone**:
Whether a count in the mailbox pane draws attention (unread) or stays quiet.
_Avoid_: Muted (that is the mailbox state)

**Sync**:
The daemon fetching new messages into its cache. A mailbox's first sync covers a recent window; a UID-validity reset drops the cache and repeats it.

**Discovery**:
Detecting a provider's mail servers for an email address.
_Avoid_: Autoconfig

**Profile**:
Which state namespace a process uses: the installed application's `vingroto` or the development checkout's `vingroto-dev`, keeping their data, configuration and notifications apart.

**Daemon**:
The process that owns the configuration, credentials, cache and mail connections, serves the API and syncs in the background.

**API**:
The daemon's HTTP interface, and the only way a client talks to the daemon.

**Operation**:
One endpoint of the API, named by its operation id, such as `message.list`.
_Avoid_: Command (that is a CLI subcommand), route (that is the path)

**Catalog**:
The client's built-in list of every API operation, used to validate invocations and generate completions.

**Token**:
The local secret every API request carries.
_Avoid_: Password (that is a mail credential)

**Client**:
Any process that talks to the daemon over the API: the TUI, the `api` command or a script. It is stateless.

**TUI**:
The interactive, full-screen client.
_Avoid_: UI, app

**Completion script**:
A static shell script, printed by `vingroto completions <shell>`, that completes the client's commands, flags and API operations.
_Avoid_: Autocomplete
