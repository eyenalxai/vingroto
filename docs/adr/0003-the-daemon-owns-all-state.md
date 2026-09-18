# The daemon owns all state

Only the daemon reads the configuration file, the OS keyring and the SQLite database, and only the daemon opens IMAP or SMTP connections. The client is stateless and talks to it over Unix-socket RPC; credentials never cross the socket.

This keeps secrets in one process, lets syncing continue while the TUI is closed, and keeps the wire contract free of anything the client could leak.

## Considered options

- **The TUI owning config and connections directly.** No background sync, and secrets spread across every terminal session the client runs in.
