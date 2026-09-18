# vingroto

A terminal mail client: OpenTUI (Solid) front end, Effect back end, imapflow / nodemailer for the wire, Drizzle on SQLite for storage.

## Requirements

- [Bun](https://bun.sh)
- `secret-tool` (libsecret) for credentials

## Usage

```sh
bun start
```

## Accounts

On the first run vingroto asks for an account. Enter the email address and password; the IMAP and SMTP servers are detected automatically (published autoconfiguration, DNS SRV records, then a hostname guess) and can be edited before saving. Press `a` at any time to add or update an account the same way.

Credentials are written to the OS keyring (`secret-tool`) and never to disk in plaintext. An account's `username` defaults to its email address.

## Configuration

`$XDG_CONFIG_HOME/vingroto/config.json`, which defaults to `~/.config/vingroto/config.json`. It is written by the account setup and holds no secrets:

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

Accounts are matched by email address, so re-running the setup for an existing address updates it in place instead of duplicating it.

## Layout

The window splits into three panes: mailboxes, the message list and the reader. The layout follows the terminal width:

| Width    | Layout                                           |
| -------- | ------------------------------------------------ |
| >= 110   | all three panes side by side                     |
| 64 - 109 | mailboxes plus the focused pane (list or reader) |
| < 64     | only the focused pane                            |

The mailbox pane starts with two virtual folders, **All emails** and **All unread**, computed from the cached messages of every account. Below them each configured account is listed with its mailboxes; accounts collapse and expand (`space`) so a long mailbox tree stays readable.

`tab` (or `left` / `right`) moves between panes, `escape` steps back.

## Syncing

Mailboxes are never mirrored in full. Each mailbox is fetched window by window: one that has never been synced gets a date window (`sync.initialDays`), and afterwards only messages above the last seen UID are fetched. When a server reassigns a mailbox's UID validity, the cached window for that mailbox is dropped and rebuilt from the date window.

`INBOX` is refreshed on startup and then every `sync.intervalMinutes`, and a mailbox that has never been synced is fetched when it is first selected. `r` syncs the selected scope: a virtual folder syncs every account's `INBOX`, an account its `INBOX`, a mailbox that mailbox.

The database lives in `$XDG_DATA_HOME/vingroto/vingroto.db`, runtime logs in `$XDG_DATA_HOME/vingroto/vingroto.log`. Logs always go to that file, never to the terminal; `VINGROTO_LOG_LEVEL=Debug` adds connection, cache and credential detail.

## Reading

Headers are synced, bodies are not. The reader shows a message straight from the local cache when it has one; `enter` fetches the full source over IMAP, parses the text and HTML parts and stores them, so the next open is instant. `\Seen` flags are not written back yet.

## Keys

| Key                                           | Action                                             |
| --------------------------------------------- | -------------------------------------------------- |
| `q`, `ctrl+c`                                 | quit                                               |
| `tab`, `shift+tab`, `left`, `right`, `h`, `l` | switch panes                                       |
| `up`, `down`, `j`, `k`                        | move the selection (reader: one line)              |
| `pgup`, `pgdn`, `b`, `f`                      | scroll the reader half a viewport                  |
| `enter`                                       | open a folder / read a message / download the body |
| `space`                                       | collapse or expand the selected account            |
| `r`                                           | sync the selected scope                            |
| `a`                                           | add or update an account                           |
| `escape`                                      | step back one pane                                 |

## Commands

```sh
bun start          # run the client
bun db:generate    # generate a migration from src/lib/db/schema.ts
bun db:check       # validate the generated migrations
bun run check      # format check, lint, typecheck
```

Migrations live in `drizzle/` and are applied on startup.
