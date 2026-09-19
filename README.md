# vingroto

A terminal mail client: an OpenTUI (Solid) TUI talking to a daemon over a local Effect HTTP API, with imapflow / nodemailer for the wire and Drizzle on SQLite for storage.

## Architecture

**TUI client ↔ local HTTP API ↔ daemon.**

- **TUI client** (`packages/client/src/tui.tsx`, `bun client`) renders the interface and talks to the API. It never reads the config file, touches the keyring or the database, or opens an IMAP/SMTP connection. While the daemon is unreachable it shows a connecting screen and keeps retrying.
- **Daemon** (`packages/server/src/server.ts`, `bun server`) owns the configuration file, the OS keyring, the SQLite database and every IMAP/SMTP connection. It serves the API and syncs mail in the background.

The daemon listens on `127.0.0.1`, starting at `VINGROTO_API_PORT` (default `8464`) and taking the next free port. The live `url`, `pid` and version go to `$XDG_RUNTIME_DIR/<app>/server.json` and the bearer token to `$XDG_RUNTIME_DIR/<app>/token`, both `0600`, falling back to `$XDG_DATA_HOME/<app>/run/` when `XDG_RUNTIME_DIR` is not set. Accounts, credentials, sync settings and cached mail live on the daemon side; passwords stay in the keyring and never cross the API, so the client cannot leak them and closing the TUI does not stop syncing.

The app name in those paths is the process's **profile**: `vingroto` when running as a standalone binary (the installed package) and `vingroto-dev` when running from source. The profile selects the data, config, log and runtime directories, the keyring service and the application name desktop notifications are raised under, so a checkout and an installed package never share state or credentials. `VINGROTO_PROFILE=installed` or `VINGROTO_PROFILE=development` overrides the detected profile.

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

The client retries until the daemon answers, so it is fine to start the client first. Both run in the development profile and use the `vingroto-dev` paths: clients find the daemon through `$XDG_RUNTIME_DIR/vingroto-dev/server.json` and read the bearer token from `$XDG_RUNTIME_DIR/vingroto-dev/token`, falling back to `$XDG_DATA_HOME/vingroto-dev/run/` when `XDG_RUNTIME_DIR` is not set. Credentials never leave the daemon: passwords are read from the OS keyring inside the daemon process and are never sent over the API, and the client never writes the config file or the database.

The root scripts change into the package before starting it. Bun's workspace filter runner (`bun run --filter`) captures a child's stdout and stderr and points its stdin at `/dev/null`, which leaves the TUI unable to read input; the client also refuses to start when stdin or stdout is not an interactive terminal.

### systemd user service

A user unit is provided in `packaging/vingroto-dev.service`. Copy it into place, adjust `WorkingDirectory` and `Environment` if your checkout differs, then enable it:

```sh
mkdir -p ~/.config/systemd/user
cp packaging/vingroto-dev.service ~/.config/systemd/user/
$EDITOR ~/.config/systemd/user/vingroto-dev.service
systemctl --user daemon-reload
systemctl --user enable --now vingroto-dev.service
```

The unit runs `bun run server` from the repository root, which delegates to the server workspace, so `WorkingDirectory` must point at the checkout (not at `packages/server`). It sets `VINGROTO_PROFILE=development`, so the daemon uses the `vingroto-dev` state. Its stdout and stderr go to the journal (`StandardOutput=journal`, `StandardError=journal`), so `journalctl --user -u vingroto-dev -f` shows the readable log lines while `$XDG_STATE_HOME/vingroto-dev/server.log` keeps the structured JSON records. Check on the daemon with `systemctl --user status vingroto-dev`. The service runs only while your user session exists; run `loginctl enable-linger $USER` once if it should keep syncing after you log out.

### Standalone binaries

`bun run build` compiles both processes into self-contained executables under `packages/*/dist/`. Bun is only needed to build them, not to run them:

```sh
bun run build
packages/server/dist/vingroto-server &   # daemon
packages/client/dist/vingroto            # client
```

The daemon binary embeds the SQLite migrations and the app version, and the client binary embeds OpenTUI and its native library, so neither reads anything from the checkout at runtime. They run in the installed profile and use the `vingroto` state and keyring entries, which a checkout's `vingroto-dev` runs never touch.

### Shell completions

`vingroto completions <bash|zsh|nushell>` prints a completion script for the client: its subcommands, the `api` operation ids and HTTP methods, request paths and `--param` values (including enum choices such as `scope=unread`):

```sh
vingroto completions bash >> ~/.bashrc
vingroto completions zsh > ~/.zsh/completions/_vingroto
vingroto completions nushell | save -f ~/.config/nushell/completions/vingroto-completions.nu
```

Distribution packages install these files for every supported shell; the commands above are for a checkout or a manual setup. `bun run build` also writes the same scripts to `packages/client/completions/`.

## API

The daemon's HTTP API is the only wire surface; it serves its OpenAPI document at `/openapi.json`. The `api` command (the client binary) makes a request, and `api list` or `api describe <operation>` print the client's built-in catalog without touching the daemon:

```sh
vingroto api list
vingroto api describe message.list

vingroto api server.status
vingroto api message.list --param scope=unread --param limit=20
vingroto api message.get --param messageId=42
vingroto api message.setSeen -d '{"ids":[42],"seen":true}'
vingroto api message.setSeen -d @body.json
vingroto api GET /api/status
```

The client builds its catalog by projecting the same `@vingroto/core` API definition the daemon serves, so `vingroto api` with no arguments and `vingroto api list` print every operation id, method, path and summary as JSON, and `vingroto api describe message.list` adds the parameters, request body, responses and a ready-to-run `usage` line. The first argument is an operation id, or an HTTP method followed by a path (`vingroto api GET /api/status` works too). `--param key=value` fills `{path}` parameters and appends the rest as query parameters, `-d`/`--data` sets the body (`@file` reads a file, `-` reads stdin; JSON unless a content type is given), `-H`/`--header name:value` adds a header, and `--server`/`VINGROTO_SERVER` plus `--token`/`VINGROTO_TOKEN` override discovery. From a checkout the same command is `bun client api server.status`.

Before sending, the client checks the invocation against the catalog: the operation must exist, every `--param` name must be one the operation declares, every required path or query parameter must be present, and an operation that requires a body must be given one. A violation exits 1 with one actionable line and never reaches the daemon:

```
error: operation account.username requires path parameter "accountId" — pass --param accountId=<value>
```

Values are the daemon's business; `--param scope=inbox` is sent and answered with the message below. Raw `vingroto api get /api/...` requests skip the catalog and stay free-form.

The response body is streamed to stdout as it arrives, so a long-lived response such as `vingroto api event.subscribe` prints events while it stays open. A non-2xx response writes the body to stdout once and one line to stderr:

```
error: GET /api/messages failed with HTTP 400 Bad Request: missing required query parameter "scope" (one of: all, unread, mailbox)
```

The exit code is 0 on success, 1 for a usage error, 2 when the daemon cannot be reached and 3 when the API answers with an error response. Failures are JSON error objects (`_tag`, `message`, and `field` for invalid requests); a method or path that matches no route answers `NotFoundError` with 404 instead of an empty body.

Plain HTTP works too:

```sh
base=$(jq -r .url "${XDG_RUNTIME_DIR:-$XDG_DATA_HOME/vingroto-dev/run}/vingroto-dev/server.json")
token=$(cat "${XDG_RUNTIME_DIR:-$XDG_DATA_HOME/vingroto-dev/run}/vingroto-dev/token")
curl -s -H "Authorization: Bearer $token" "$base/api/status"
```

## Accounts

On the first run vingroto asks for an account. Enter the email address and password; the IMAP and SMTP servers are detected automatically (published autoconfiguration, DNS SRV records, then a hostname guess) and can be edited before saving. The mailbox name defaults to the email address and the sender name is optional. Press `ctrl+x a` at any time to add another account the same way, or `ctrl+x s` to edit an existing one in the settings screen.

Credentials are written to the OS keyring (`secret-tool`) and never to disk in plaintext. An account's `username` defaults to its email address.

## Configuration

`$XDG_CONFIG_HOME/<app>/config.json`: `~/.config/vingroto/config.json` for the installed package and `~/.config/vingroto-dev/config.json` from a checkout. It is written by the daemon during account setup and holds no secrets:

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
  "sync": { "initialDays": 30, "intervalMinutes": 5 },
  "notifications": { "enabled": true }
}
```

`label` is the mailbox name shown in the sidebar and defaults to the account's email address; `name` is the optional sender name. Accounts are matched by email address, so re-running the setup for an existing address updates it in place instead of duplicating it.

## Notifications

New mail is announced by whichever process can judge it. While no client is attached, the daemon raises a freedesktop notification (`org.freedesktop.Notifications`) over the D-Bus session bus; while a client is attached, the daemon stays silent and the client raises one through the terminal instead. Neither ever announces a muted mailbox, a mailbox's first sync or a UID-validity reset, and a notification never carries sound. `notifications.enabled` in the config file turns new-mail alerts off for both sides.

The daemon takes the session bus address from `DBUS_SESSION_BUS_ADDRESS`, falling back to `unix:path=$XDG_RUNTIME_DIR/bus`: a Wayland/systemd user session. It never discovers buses through X11, and a session without a notification daemon simply stays silent.

The attached client asks OpenTUI for a terminal notification. Terminals that support OSC 99 notify natively; for the others OpenTUI writes an OSC 777 sequence, which Ghostty and foot display. Terminals that support neither stay silent. The client suppresses an alert only when it would interrupt someone already looking at the mail: it stays silent while the terminal is focused (an unknown focus counts as focused), no search is running and the new mail arrived in the list currently shown. A blurred terminal, mail in another list, or any mail while searching is announced.

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

- **Accounts** — edit the mailbox name, sender name, username, IMAP and SMTP servers, and whether a copy of sent mail is saved (`saveSent`). The email address is fixed; a new password can be entered, otherwise the stored one is kept.
- **Mailboxes** — mute or unmute any synced mailbox. Mailboxes are grouped by account; `enter` or `space` collapses a group, and on a mailbox toggles its mute in place.
- **Sync** — how far back the first sync goes (`initialDays`) and how often `INBOX` is refreshed (`intervalMinutes`).
- **Sending** — how long a message waits before it is sent (`delaySeconds`); `0` sends immediately.
- **+ Add account** — closes settings and starts the account wizard.

The account order is the order of the config file. `shift+up` and `shift+down` move the selected account, so the first account is the compose default. `enter` on an account, the sync settings or the sending settings opens its editor, `tab` moves between the sidebar and the editor, `esc` climbs back one step and closes the screen at the top.

## Syncing

Mailboxes are never mirrored in full. Each mailbox is fetched window by window: one that has never been synced gets a date window (`sync.initialDays`), and afterwards only messages above the last seen UID are fetched. When a server reassigns a mailbox's UID validity, the cached window for that mailbox is dropped and rebuilt from the date window.

`INBOX` is refreshed by the daemon on startup and then every `sync.intervalMinutes`, and a mailbox that has never been synced is fetched when it is first selected. `ctrl+x r` asks the daemon to sync the selected scope: a virtual view syncs every account's `INBOX`, an account its `INBOX`, a mailbox that mailbox. Every pane shows a spinner while a query or sync is in flight instead of a stale or empty state.

The daemon keeps the database in `$XDG_DATA_HOME/<app>/vingroto.db` (with `<app>` being `vingroto` when installed and `vingroto-dev` from a checkout) and writes structured JSON logs to `$XDG_STATE_HOME/<app>/server.log` (default `~/.local/state/<app>/server.log`), mirroring the same records to stderr as plain single-line entries for journald. The client keeps its own JSON log at `$XDG_STATE_HOME/<app>/client.log` and never writes to the terminal. `VINGROTO_LOG_LEVEL=Debug` adds connection, cache and credential detail.

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
| `shift+up`, `shift+down`                      | settings: move the selected account up or down             |
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
