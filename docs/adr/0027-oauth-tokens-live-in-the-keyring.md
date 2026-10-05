# OAuth tokens live in the keyring and the daemon runs the flow

Status: accepted

An account's Google refresh token and its optional client secret are credentials, so they live in the OS keyring through the existing `Credential` service, never in the config file or the database; the config carries only the client id. The daemon already owns the keyring and every IMAP/SMTP connection, and it is the only process that can mint access tokens, so the loopback browser flow runs there too, behind the `account.oauth.authorize` API operation. The daemon opens the system browser, receives Google's callback on an ephemeral `127.0.0.1` listener with PKCE (S256) and `state`, exchanges the code, and stores the refresh token. Clients stay stateless and never see a token: they wait for the operation, which runs under a five-minute deadline, and report its outcome. Access tokens are cached in daemon memory with their expiry, refreshed within five minutes of it, and one refresh per account is deduplicated across IMAP and SMTP; no access token is ever written down.

Re-authorization is therefore an API operation, not a settings edit: the **Re-authorize** row re-runs `account.oauth.authorize` and replaces the stored refresh token. A flow that is abandoned or fails closes the listener and leaves the stored authorization untouched, and an `invalid_grant` refresh surfaces as `authorization expired · re-authorize in settings` instead of being retried. A flow that completes but is abandoned before the account is created can leave a refresh token in the keyring for an address with no account; the next sign-in for that address overwrites it.

Sources: `docs/research/gmail-oauth.md` §1.4 and §2.5 (token lifetimes), §2.1 (loopback and PKCE), and fact 14 (tokens are sensitive at rest).

## Considered options

- **Storing tokens in the config file or the database.** Rejected: the config file's no-secrets contract, and the Workspace developer policy calls for tokens encrypted at rest; the keyring already holds every password.
- **Running the flow in the TUI.** Rejected: clients are stateless by design and never see tokens, and the daemon owns the refresh lifecycle that both IMAP and SMTP depend on.
- **Letting nodemailer refresh tokens itself.** Rejected: its default token endpoint is legacy, and imapflow has no refresh hook at all, so the lifecycle belongs in one daemon service instead of the libraries.
