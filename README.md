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

## Commands

```sh
bun start          # run the client
bun db:generate    # generate a migration from src/lib/db/schema.ts
bun db:check       # validate the generated migrations
bun run check      # format check, lint, typecheck
```

Migrations live in `drizzle/` and are applied on startup.
