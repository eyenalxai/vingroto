# vingroto

A terminal mail client: an OpenTUI (Solid) TUI talking to a daemon over a Unix-socket Effect RPC, with imapflow / nodemailer for the wire and Drizzle on SQLite for storage.

## Architecture

**TUI client ↔ Unix-socket RPC ↔ daemon.**

- **TUI client** (`src/index.tsx`, `bun start`) renders the interface and sends commands over RPC. It never reads the config file, touches the keyring or the database, or opens an IMAP/SMTP connection. While the daemon is unreachable it shows a connecting screen and keeps retrying.
- **Daemon** (`src/server.ts`, `bun server`) owns the configuration file, the OS keyring, the SQLite database and every IMAP/SMTP connection. It serves the client's requests and syncs mail in the background.

The two processes find each other at `$XDG_RUNTIME_DIR/vingroto/server.sock`, falling back to `$XDG_DATA_HOME/vingroto/run/vingroto/server.sock` when `XDG_RUNTIME_DIR` is not set. Accounts, credentials, sync settings and cached mail live on the daemon side; passwords stay in the keyring and never cross the socket, so the client cannot leak them and closing the TUI does not stop syncing.

## Requirements

- [Bun](https://bun.sh)
- `secret-tool` (libsecret) for credentials

## Running

Start the daemon in the background, then the client:

```sh
bun server &             # or: bun run src/server.ts &
bun start
```

The client retries until the daemon answers, so it is fine to start the client first. Both processes meet at `$XDG_RUNTIME_DIR/vingroto/server.sock`, falling back to `$XDG_DATA_HOME/vingroto/run/vingroto/server.sock` when `XDG_RUNTIME_DIR` is not set. Credentials never leave the daemon: passwords are read from the OS keyring inside the daemon process and are never sent over the socket, and the client never writes the config file or the database.

### systemd user service

A user unit is provided in `packaging/vingroto.service`. Copy it into place, adjust `WorkingDirectory` and `Environment` if your checkout differs, then enable it:

```sh
mkdir -p ~/.config/systemd/user
cp packaging/vingroto.service ~/.config/systemd/user/
$EDITOR ~/.config/systemd/user/vingroto.service
systemctl --user daemon-reload
systemctl --user enable --now vingroto.service
```

Check on the daemon with `systemctl --user status vingroto` and follow it with `journalctl --user -u vingroto -f`. The service runs only while your user session exists; run `loginctl enable-linger $USER` once if it should keep syncing after you log out.

## Accounts

On the first run vingroto asks for an account. Enter the email address and password; the IMAP and SMTP servers are detected automatically (published autoconfiguration, DNS SRV records, then a hostname guess) and can be edited before saving. The mailbox name defaults to the email address and the sender name is optional. Press `ctrl+x a` at any time to add another account the same way, or `ctrl+x s` to edit an existing one in the settings screen.

Credentials are written to the OS keyring (`secret-tool`) and never to disk in plaintext. An account's `username` defaults to its email address.

## Configuration

`$XDG_CONFIG_HOME/vingroto/config.json`, which defaults to `~/.config/vingroto/config.json`. It is written by the daemon during account setup and holds no secrets:

```json
{
  "accounts": [
    {
      "id": "mail@example.com",
      "label": "Personal",
      "name": "Sender Name",
      "email": "mail@example.com",
      "imap": { "host": "imap.example.com", "port": 993, "security": "tls" },
      "smtp": { "host": "smtp.example.com", "port": 465, "security": "tls" }
    }
  ],
  "sync": { "initialDays": 30, "intervalMinutes": 5 }
}
```

`label` is the mailbox name shown in the sidebar and defaults to the account's email address; `name` is the optional sender name. Accounts are matched by email address, so re-running the setup for an existing address updates it in place instead of duplicating it.

## Layout

The window splits into three panes: mailboxes, the message list and the reader. The layout follows the terminal width:

| Width    | Layout                                           |
| -------- | ------------------------------------------------ |
| >= 110   | all three panes side by side                     |
| 64 - 109 | mailboxes plus the focused pane (list or reader) |
| < 64     | only the focused pane                            |

The mailbox pane starts with two virtual folders, **All emails** and **All unread**, computed from the cached messages of every account. Below them each configured account is listed with its mailboxes; accounts collapse and expand (`space`) so a long mailbox tree stays readable. The settings screen groups folders by account the same way, with its own collapse state.

Mailboxes can be muted with `i` (or from the settings screen). A muted mailbox is dimmed, marked with `⊘`, and excluded from every unread count, from **All unread** and from body prefetching; its mail is still listed and readable.

`tab` (or `left` / `right`) moves between panes, `escape` steps back.

## Settings

`ctrl+x s` opens a full-screen settings screen: a sidebar with a search box on the left, the selected editor on the right.

- **Accounts** — edit the mailbox name, sender name, username, IMAP and SMTP servers. The email address is fixed; a new password can be entered, otherwise the stored one is kept.
- **Folders** — mute or unmute any synced mailbox. Folders are grouped by account; `enter` on a group collapses or expands it.
- **Sync** — how far back the first sync goes (`initialDays`) and how often `INBOX` is refreshed (`intervalMinutes`).
- **+ Add account** — closes settings and starts the account wizard.

Typing in the search box filters both sections and entries; collapsed groups are expanded while a query is active. `tab` (or `enter`) focuses the editor, `esc` climbs back one step and closes the screen at the top.

## Syncing

Mailboxes are never mirrored in full. Each mailbox is fetched window by window: one that has never been synced gets a date window (`sync.initialDays`), and afterwards only messages above the last seen UID are fetched. When a server reassigns a mailbox's UID validity, the cached window for that mailbox is dropped and rebuilt from the date window.

`INBOX` is refreshed by the daemon on startup and then every `sync.intervalMinutes`, and a mailbox that has never been synced is fetched when it is first selected. `ctrl+x r` asks the daemon to sync the selected scope: a virtual folder syncs every account's `INBOX`, an account its `INBOX`, a mailbox that mailbox. Every pane shows a spinner while a query or sync is in flight instead of a stale or empty state.

The daemon keeps the database in `$XDG_DATA_HOME/vingroto/vingroto.db` and writes its log to `$XDG_DATA_HOME/vingroto/vingroto.log`. Logs go to that file rather than the terminal; `VINGROTO_LOG_LEVEL=Debug` adds connection, cache and credential detail.

## Reading

Headers are synced, bodies are not. The reader shows a message straight from the local cache when it has one; `enter` asks the daemon to fetch the full source over IMAP, parse the text and HTML parts and store them, so the next open is instant.

Bodies are rendered as plain terminal text. HTML is parsed, not regex-stripped: `style` and `script` blocks, hidden preheaders (`display:none`, `visibility:hidden`, zero-height or zero-opacity blocks) and tracking pixels are dropped, links keep their text with the target in brackets and images render only a meaningful `alt`. What remains is normalized: HTML entities and `&nbsp;` are decoded, zero-width and other invisible spacer characters are removed, runs of spaces collapse and blank-line ladders shrink to a single empty line. A `text/plain` part that is really raw HTML or CSS is converted the same way, so a broken sender cannot leak `td, p { font-family: … }` into the reader. Links and URLs are clickable; long tracking URLs are shown truncated but open in full.

`r` marks the selected (or selected set of) messages read and `u` marks them unread; `\Seen` is written back to the server. `m` moves them to another mailbox of the same account. Both actions ask the daemon to talk to the mail server first and update the local cache afterwards; if some mailboxes fail, the rest still applies and the failures are reported in the status bar.

## Keys

| Key                                           | Action                                                             |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `q`, `ctrl+c`                                 | quit                                                               |
| `tab`, `shift+tab`, `left`, `right`, `h`, `l` | switch panes                                                       |
| `up`, `down`, `j`, `k`                        | move the selection (reader: one line)                              |
| `pgup`, `pgdn`, `b`, `f`                      | scroll the reader half a viewport                                  |
| `enter`                                       | open a folder / read a message / download the body                 |
| `space`                                       | folders: collapse or expand the account · list: select the message |
| `r`                                           | list: mark read                                                    |
| `u`                                           | list: mark unread                                                  |
| `m`                                           | list: move to another mailbox                                      |
| `ctrl+a`                                      | list: select every loaded message / clear                          |
| `i`                                           | folders: mute or unmute the mailbox                                |
| `escape`                                      | list: clear the selection · otherwise step back                    |
| `ctrl+x` `a`                                  | add an account                                                     |
| `ctrl+x` `s`                                  | settings                                                           |
| `ctrl+x` `r`                                  | ask the daemon to sync the selected scope                          |

`ctrl+x` is the leader: press it, then the action key. The secondary bindings are listed in the status bar while it waits.

## Commands

```sh
bun server         # run the daemon
bun start          # run the client
bun db:generate    # generate a migration from src/lib/db/schema.ts
bun db:check       # validate the generated migrations
bun run check      # format check, lint, typecheck
```

Migrations live in `drizzle/` and are applied by the daemon on startup.
