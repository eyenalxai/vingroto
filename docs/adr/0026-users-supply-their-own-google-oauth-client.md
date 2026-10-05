# Users supply their own Google OAuth client

Status: accepted

Gmail sign-in uses an OAuth client the user creates in their own Google Cloud project; vingroto ships no Google credentials of its own. The scope Gmail IMAP and SMTP require, `https://mail.google.com/`, is restricted, so a vendor-owned client would need restricted-scope verification and, most likely, the annual CASA security assessment before public distribution, and until verification completes it would sit under the 100-new-user cap an unverified app carries for the project's lifetime. A user-supplied client rides the personal-use exception instead — no verification for fewer than 100 users — and matches what aerc and mutt do. It also keeps vingroto out of the credential-distribution business: Google hashes a client secret after creation, so a shipped one could not be rotated silently.

The setup walkthrough is therefore part of the product, not tribal knowledge: the README has the user create a Desktop app client, add themselves as a test user, set the publishing status to **In production** so the refresh token does not expire after seven days, and paste the Client ID and optional Client secret into the wizard. The secret is optional because Google does not treat a desktop client's secret as confidential and shows it only once; when given, it is stored in the keyring with the refresh token ([ADR-0027](0027-oauth-tokens-live-in-the-keyring.md)).

The constraints are sourced in `docs/research/gmail-oauth.md`: §3.1 (Testing expiry, the 100-user cap, personal use), §3.3 (`https://mail.google.com/` is restricted), §2.6 (the client secret), and §4.5 (aerc and mutt).

## Considered options

- **Shipping a vingroto-owned client.** Rejected: restricted-scope verification plus a likely annual security assessment before anyone outside the project can use it, with the 100-new-user cap applying until verification completes; whether an IMAP/SMTP client passes the verification's minimum-scope test is also uncertain.
- **Shipping a client and staying unverified.** Rejected: the cap applies over the project's lifetime and cannot be reset, and exhausting it disables sign-in for every user.
- **Requiring the client secret.** Rejected: Google shows it once at creation and marks it optional for installed apps, so requiring it would lock out a user who no longer has it.
