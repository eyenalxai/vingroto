# vingroto

A terminal mail client: OpenTUI (Solid) front end, Effect back end, imapflow / nodemailer for the wire, Drizzle on SQLite for storage.

## Requirements

- [Bun](https://bun.sh)
- `op` (1Password CLI), signed in
- `secret-tool` (libsecret) for the credential cache

## Usage

```sh
bun start
```

## Configuration

`$XDG_CONFIG_HOME/vingroto/config.json`, which defaults to `~/.config/vingroto/config.json`:

```json
{
  "accounts": [
    {
      "id": "personal",
      "label": "Personal",
      "name": "Sender Name",
      "email": "mail@example.com",
      "username": "op://Private/Item/username",
      "password": "op://Private/Item/password",
      "imap": { "host": "imap.example.com", "port": 993, "security": "tls" },
      "smtp": { "host": "smtp.example.com", "port": 465, "security": "tls" }
    }
  ],
  "sync": { "initialDays": 30, "intervalMinutes": 5 }
}
```

`username` and `password` are 1Password references, never literals. Each value is read with `op read` and then cached in the OS keyring, so 1Password only prompts when the keyring entry is missing.

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
| `escape`                                      | step back one pane                                 |

## Commands

```sh
bun start          # run the client
bun db:generate    # generate a migration from src/lib/db/schema.ts
bun db:check       # validate the generated migrations
bun run check      # format check, lint, typecheck
```

Migrations live in `drizzle/` and are applied on startup.
