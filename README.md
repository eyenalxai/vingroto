# vingroto

A terminal mail client: an OpenTUI (Solid) TUI talking to a daemon over a local Effect HTTP API, with imapflow / nodemailer for the wire and Drizzle on SQLite for storage.

## Architecture

**TUI client ↔ local HTTP API ↔ daemon.**

- **TUI client** (`packages/client/src/tui.tsx`, `bun client`) renders the interface and talks to the API. It never reads the config file, touches the keyring or the database, or opens an IMAP/SMTP connection. While the daemon is unreachable it shows a connecting screen and keeps retrying.
- **Daemon** (`packages/server/src/server.ts`, `bun server`) owns the configuration file, the OS keyring, the SQLite database and every IMAP/SMTP connection. It serves the API and syncs mail in the background.

The daemon listens on `127.0.0.1`, starting at `VINGROTO_API_PORT` (default `8464`) and taking the next free port. The live `url`, `pid` and version go to `$XDG_RUNTIME_DIR/vingroto/server.json` and the bearer token to `$XDG_RUNTIME_DIR/vingroto/token`, both `0600`, falling back to `$XDG_DATA_HOME/vingroto/run/` when `XDG_RUNTIME_DIR` is not set. Accounts, credentials, sync settings and cached mail live on the daemon side; passwords stay in the keyring and never cross the API, so the client cannot leak them and closing the TUI does not stop syncing.

## Workspace

The repository is a Bun workspace with three packages:

| Package            | Contents                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `@vingroto/core`   | Paths, logging, errors, config schema, mail addresses and the HTTP API contract.             |
| `@vingroto/client` | The OpenTUI (Solid) interface, the `api` command and the client runtime that speaks the API. |
| `@vingroto/server` | The daemon: config, credentials, SQLite, IMAP/SMTP, sync and API handlers.                   |

`@vingroto/core` is imported by its subpaths (`@vingroto/core/protocol/api`, …) and the client and server use the `@/*` alias inside their own package. `tsconfig.base.json` holds the shared compiler options, each package has its own `tsconfig.json`, and `packages/client/bunfig.toml` preloads the OpenTUI Solid transform.

## Requirements

- [Bun](https://bun.sh)
- `secret-tool` (libsecret) for credentials

## Running

Start the daemon in the background, then the client:

```sh
bun server &   # daemon
bun client     # client
```

The client retries until the daemon answers, so it is fine to start the client first. Clients find the daemon through `$XDG_RUNTIME_DIR/vingroto/server.json` and read the bearer token from `$XDG_RUNTIME_DIR/vingroto/token`, falling back to `$XDG_DATA_HOME/vingroto/run/` when `XDG_RUNTIME_DIR` is not set. Credentials never leave the daemon: passwords are read from the OS keyring inside the daemon process and are never sent over the API, and the client never writes the config file or the database.

The root scripts change into the package before starting it. Bun's workspace filter runner (`bun run --filter`) captures a child's stdout and stderr and points its stdin at `/dev/null`, which leaves the TUI unable to read input; the client also refuses to start when stdin or stdout is not an interactive terminal.

### systemd user service

A user unit is provided in `packaging/vingroto.service`. Copy it into place, adjust `WorkingDirectory` and `Environment` if your checkout differs, then enable it:

```sh
mkdir -p ~/.config/systemd/user
cp packaging/vingroto.service ~/.config/systemd/user/
$EDITOR ~/.config/systemd/user/vingroto.service
systemctl --user daemon-reload
systemctl --user enable --now vingroto.service
```

The unit runs `bun run server` from the repository root, which delegates to the server workspace, so `WorkingDirectory` must point at the checkout (not at `packages/server`). Its stdout and stderr go to the journal (`StandardOutput=journal`, `StandardError=journal`), so `journalctl --user -u vingroto -f` shows the readable log lines while `$XDG_STATE_HOME/vingroto/server.log` keeps the structured JSON records. Check on the daemon with `systemctl --user status vingroto`. The service runs only while your user session exists; run `loginctl enable-linger $USER` once if it should keep syncing after you log out.

### Standalone binaries

`bun run build` compiles both processes into self-contained executables under `packages/*/dist/`. Bun is only needed to build them, not to run them:

```sh
bun run build
packages/server/dist/vingroto-server &   # daemon
packages/client/dist/vingroto            # client
```

The daemon binary embeds the SQLite migrations and the app version, and the client binary embeds OpenTUI and its native library, so neither reads anything from the checkout at runtime.

## API

The daemon's HTTP API is the only wire surface; it serves its OpenAPI document at `/openapi.json`. The `api` command (the client binary) sends a request to the running daemon:

```sh
vingroto api server.status
vingroto api message.list --param scope=unread --param limit=20
vingroto api message.get --param messageId=42
vingroto api message.setSeen -d '{"ids":[42],"seen":true}'
vingroto api GET /api/status
```

The first argument is an OpenAPI operation id, resolved against the live document, or an HTTP method followed by a path. `--param key=value` fills `{path}` parameters and appends the rest as query parameters, `-d`/`--data` sets the body (JSON unless a content type is given), `-H`/`--header name:value` adds a header, and `--server`/`VINGROTO_SERVER` plus `--token`/`VINGROTO_TOKEN` override discovery. The body goes to stdout; a non-2xx response writes the status to stderr and exits non-zero. From a checkout the same command is `bun client api server.status`.

Plain HTTP works too:

```sh
base=$(jq -r .url "${XDG_RUNTIME_DIR:-$XDG_DATA_HOME/vingroto/run}/vingroto/server.json")
token=$(cat "${XDG_RUNTIME_DIR:-$XDG_DATA_HOME/vingroto/run}/vingroto/token")
curl -s -H "Authorization: Bearer $token" "$base/api/status"
```

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

The mailbox pane starts with two virtual views, **All emails** and **All unread**, computed from the cached messages of every account. A virtual view shows one row per email even when the account caches it in several mailboxes, and unread totals count each email once. Below them each configured account is listed with its mailboxes; accounts collapse and expand (`space`) so a long mailbox tree stays readable. The settings screen groups mailboxes by account the same way, with its own collapse state.

Mailboxes can be muted with `i` (or from the settings screen). A muted mailbox is dimmed, marked with `⊘`, and excluded from **All unread**, from account and global unread totals and from body prefetching; its own unread count stays visible and its mail is still listed and readable.

`tab` (or `left` / `right`) moves between panes, `escape` steps back.

## Settings

`ctrl+x s` opens a full-screen settings screen: a sidebar on the left, the selected editor on the right.

- **Accounts** — edit the mailbox name, sender name, username, IMAP and SMTP servers. The email address is fixed; a new password can be entered, otherwise the stored one is kept.
- **Mailboxes** — mute or unmute any synced mailbox. Mailboxes are grouped by account; `enter` or `space` collapses a group, and on a mailbox toggles its mute in place.
- **Sync** — how far back the first sync goes (`initialDays`) and how often `INBOX` is refreshed (`intervalMinutes`).
- **+ Add account** — closes settings and starts the account wizard.

`enter` on an account or the sync settings opens its editor, `tab` moves between the sidebar and the editor, `esc` climbs back one step and closes the screen at the top.

## Syncing

Mailboxes are never mirrored in full. Each mailbox is fetched window by window: one that has never been synced gets a date window (`sync.initialDays`), and afterwards only messages above the last seen UID are fetched. When a server reassigns a mailbox's UID validity, the cached window for that mailbox is dropped and rebuilt from the date window.

`INBOX` is refreshed by the daemon on startup and then every `sync.intervalMinutes`, and a mailbox that has never been synced is fetched when it is first selected. `ctrl+x r` asks the daemon to sync the selected scope: a virtual view syncs every account's `INBOX`, an account its `INBOX`, a mailbox that mailbox. Every pane shows a spinner while a query or sync is in flight instead of a stale or empty state.

The daemon keeps the database in `$XDG_DATA_HOME/vingroto/vingroto.db` and writes structured JSON logs to `$XDG_STATE_HOME/vingroto/server.log` (default `~/.local/state/vingroto/server.log`), mirroring the same records to stderr as plain single-line entries for journald. The client keeps its own JSON log at `$XDG_STATE_HOME/vingroto/client.log` and never writes to the terminal. `VINGROTO_LOG_LEVEL=Debug` adds connection, cache and credential detail.

## Reading

Headers are synced, bodies are not. The reader shows a message straight from the local cache when it has one; `enter` asks the daemon to fetch the full source over IMAP, parse the text and HTML parts and store them, so the next open is instant.

Bodies are rendered as plain terminal text. HTML is parsed, not regex-stripped: `style` and `script` blocks, hidden preheaders (`display:none`, `visibility:hidden`, zero-height or zero-opacity blocks) and tracking pixels are dropped, links keep their text with the target in brackets and images render only a meaningful `alt`. What remains is normalized: HTML entities and `&nbsp;` are decoded, zero-width and other invisible spacer characters are removed, runs of spaces collapse and blank-line ladders shrink to a single empty line. A `text/plain` part that is really raw HTML or CSS is converted the same way, so a broken sender cannot leak `td, p { font-family: … }` into the reader. Links and URLs are clickable; long tracking URLs are shown truncated but open in full.

`r` marks the selected (or selected set of) messages read and `u` marks them unread; `\Seen` is written back to the server. `m` moves them to another mailbox of the same account. Both actions ask the daemon to talk to the mail server first and update the local cache afterwards; if some mailboxes fail, the rest still applies and the failures are reported in the status bar.

## Keys

| Key                                           | Action                                                     |
| --------------------------------------------- | ---------------------------------------------------------- |
| `q`, `ctrl+c`                                 | quit                                                       |
| `tab`, `shift+tab`, `left`, `right`, `h`, `l` | switch panes                                               |
| `up`, `down`, `j`, `k`                        | move the selection (reader: one line)                      |
| `pgup`, `pgdn`, `b`, `f`                      | scroll the reader half a viewport                          |
| `enter`                                       | open a mailbox / read a message / download the body        |
| `space`                                       | mailboxes: collapse the account · list: select the message |
| `r`                                           | list: mark read                                            |
| `u`                                           | list: mark unread                                          |
| `m`                                           | list: move to another mailbox                              |
| `ctrl+a`                                      | list: select every loaded message / clear                  |
| `i`                                           | mailboxes: mute or unmute the mailbox                      |
| `escape`                                      | list: clear the selection · otherwise step back            |
| `ctrl+x` `a`                                  | add an account                                             |
| `ctrl+x` `s`                                  | settings                                                   |
| `ctrl+x` `r`                                  | ask the daemon to sync the selected scope                  |

`ctrl+x` is the leader: press it, then the action key. The secondary bindings are listed in the status bar while it waits.

## Commands

```sh
bun server         # run the daemon
bun client         # run the client
bun client api …   # send an API request to the running daemon
bun run build      # compile standalone binaries into packages/*/dist/
bun db:generate    # generate a migration from packages/server/src/lib/db/schema.ts
bun db:check       # validate the generated migrations
bun run test       # run the server and client test suites
bun run check      # format check, lint, typecheck, tests
```

Migrations live in `packages/server/drizzle/` and are applied by the daemon on startup.
