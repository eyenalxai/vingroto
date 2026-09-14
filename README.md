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

## Syncing

Mailboxes are never mirrored in full. Each mailbox is fetched window by window: one that has never been synced gets a date window (`sync.initialDays`), and afterwards only messages above the last seen UID are fetched. When a server reassigns a mailbox's UID validity, the cached window for that mailbox is dropped and rebuilt from the date window.

`INBOX` is refreshed on startup and then every `sync.intervalMinutes`; a mailbox that has never been synced is fetched when it is first selected.

The database lives in `$XDG_DATA_HOME/vingroto/vingroto.db`, runtime logs in `$XDG_DATA_HOME/vingroto/vingroto.log`.

## Keys

| Key                    | Action                                       |
| ---------------------- | -------------------------------------------- |
| `q`, `ctrl+c`          | quit                                         |
| `tab`                  | switch between the mailbox and message panes |
| `up`, `down`, `j`, `k` | move the selection                           |
| `r`                    | sync the selected mailbox                    |
| `escape`               | jump back to the mailbox pane                |

## Commands

```sh
bun start          # run the client
bun db:generate    # generate a migration from src/lib/db/schema.ts
bun db:check       # validate the generated migrations
bun run check      # format check, lint, typecheck
```

Migrations live in `drizzle/` and are applied on startup.
