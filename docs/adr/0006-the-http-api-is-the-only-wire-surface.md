# The HTTP API is the daemon's only wire surface

Status: accepted

Every client — the TUI, the `api` command and scripts — talks to the daemon over an Effect `HttpApi` served on `127.0.0.1` with a bearer token. The Unix-socket RPC layer is gone: one typed contract, one OpenAPI document and one set of schemas serve the TUI, the CLI and automation, instead of a private RPC group that a second surface must be kept in step with. The daemon starts at port `VINGROTO_API_PORT` (default 8464) and takes the next free port; it writes the live `url`, `pid` and `version` to `<runtime>/server.json` and the token (created once, `0600`) to `<runtime>/token`, and clients read those to find and authenticate it. A lock directory in the runtime directory replaces the socket probe as the "a daemon is already running" check. Domain failures cross as typed HTTP errors with status codes; ADR-0001's collapse to plain messages now applies only to failures no consumer branches on, and adding a typed error follows the same graduation rule.

## Considered options

- **Keep RPC for the TUI and add HTTP alongside.** Rejected: every operation would be declared twice (`RpcGroup` and `HttpApi`) with nothing forcing the two contracts to agree, and the two error policies would drift.
- **Serve HTTP over the Unix socket.** Rejected: Effect's Bun HTTP client does not expose unix sockets, so the TUI would need a custom client and curl/scripts would need `--unix-socket`.
- **A fixed port with a fail-fast bind.** Rejected: an unrelated process holding the port would block the daemon; taking the next free port keeps startup independent of what else listens.
- **CORS for browser clients.** Rejected for now: every consumer is a local non-browser process; it stays a deliberate no until a browser client exists.
