# Gmail OAuth (XOAUTH2) — research notes

Fact-finding for adding Gmail account support via OAuth 2.0 (XOAUTH2) instead of app passwords.

- **Date of research:** 2026-10-05.
- **Method:** primary sources only — Google's own documentation (developers.google.com, support.google.com, developers.googleblog.com), RFCs, installed library source in this repo, and reference implementation source (aerc locally, Google's Python sample, mutt, Thunderbird).
- Everything in the fact sections is traceable to a citation. Uncertainty lives in [Open questions](#open-questions).

Local source paths cited below are on this machine:

- `/home/ulezot/Projects/other/aerc` — aerc checkout.
- `/home/ulezot/Projects/js/vingroto/packages/server/node_modules/imapflow` — imapflow 2.0.2 (`package.json:3`).
- `/home/ulezot/Projects/js/vingroto/packages/server/node_modules/nodemailer` — nodemailer 10.0.7 (`package.json:3`).

There is no himalaya or standalone `mutt_oauth2.py` checkout under `/home/ulezot/Projects/other`; the only mail client with OAuth code there is aerc.

---

## 1. Gmail IMAP/SMTP OAuth mechanics

### 1.1 SASL XOAUTH2 token format

Google's specification is "OAuth 2.0 mechanism" at <https://developers.google.com/workspace/gmail/imap/xoauth2-protocol> (last updated 2026-09-15). It defines the SASL XOAUTH2 mechanism for IMAP `AUTHENTICATE`, POP `AUTH`, and SMTP `AUTH`.

Initial client response format, verbatim from that page:

```
base64("user=" {User} "^Aauth=Bearer " {Access Token} "^A^A")
```

where `^A` is Control-A (`\001`) and base64 is RFC 4648 (<https://datatracker.ietf.org/doc/html/rfc4648>). Before encoding:

```
user=someuser@example.com^Aauth=Bearer ya29.vF9dft4qmTc2Nvb3RlckBhdHRhdmlzdGEuY29tCg^A^A
```

Protocol specifics from the same page:

- IMAP: `C: A01 AUTHENTICATE XOAUTH2 <base64>`. With the `SASL-IR` capability the initial response goes on the `AUTHENTICATE` line (RFC 4959), one round trip.
- SMTP: `C: AUTH XOAUTH2 <base64>`; success is `235 2.7.0 Accepted` (RFC 4954).
- POP: `C: AUTH XOAUTH2 <base64>` (RFC 1734).
- Gmail's advertised capabilities in the documented exchange are `AUTH=XOAUTH2 AUTH=XOAUTH` (the page's IMAP example CAPABILITY line).

Error response: the server sends a `+`/`334` challenge whose payload is `base64({JSON-Body})` with `status`, `schemes`, and `scope`. Documented example after decoding:

```json
{ "status": "401", "schemes": "bearer", "scope": "https://mail.google.com/" }
```

The client must reply with an empty response (`\r\n`) to this challenge, after which the server ends the exchange with `A01 NO SASL authentication failed` (IMAP) or `535 5.7.1 ... BadCredentials` (SMTP).

### 1.2 What the libraries do with the format

**imapflow 2.0.2** — `/home/ulezot/Projects/js/vingroto/packages/server/node_modules/imapflow/dist/esm/commands/authenticate.js`:

- Mechanism selection (lines 191–208): when `auth.accessToken` is set and the server advertises `AUTH=OAUTHBEARER`, `AUTH=XOAUTH`, or `AUTH=XOAUTH2`, it calls `authOauth`; otherwise it falls back to password mechanisms.
- `authOauth` prefers OAUTHBEARER when advertised (lines 34–54), otherwise XOAUTH2 (lines 55–62):
  ```js
  // XOAUTH2 payload (Google-specific): simpler format, also \x01-delimited.
  // Format: "user=<user>" \x01 "auth=Bearer <token>" \x01 \x01
  oauthbearer = [`user=${username}`, `auth=Bearer ${accessToken}`, "", ""].join("\x01")
  command = "XOAUTH2"
  breaker = ""
  ```
- The payload is base64-encoded and sent as the `AUTHENTICATE XOAUTH2 <base64>` argument (lines 64–68). On a `+` continuation the server's base64 JSON error is parsed into `err.oauthError`, then the breaker is written (lines 69–88).
- The OAUTHBEARER payload follows RFC 7628: `n,a=<user>,\x01host=...\x01port=...\x01auth=Bearer <token>\x01\x01`, with `host`/`port` taken from the live connection (lines 34–53).

**nodemailer 10.0.7** — `/home/ulezot/Projects/js/vingroto/packages/server/node_modules/nodemailer/dist/esm/xoauth2/index.js`:

- `buildXOAuth2Token` (lines 285–288) builds exactly Google's format and base64-encodes it:
  ```js
  const authData = [
    "user=" + (this.options.user || ""),
    "auth=Bearer " + (accessToken || this.accessToken),
    "",
    "",
  ]
  return Buffer.from(authData.join("\x01"), "utf-8").toString("base64")
  ```
- The SMTP connection sends `AUTH XOAUTH2 <token>` (`dist/esm/smtp-connection/index.js:1627`), selecting XOAUTH2 automatically when `auth.oauth2` is present (`smtp-connection/index.js:404–405`).

**aerc** (local) — `/home/ulezot/Projects/other/aerc/lib/auth/xoauth2.go`:

- `Start()` (lines 37–41) produces `user=<username>\x01auth=Bearer <token>\x01\x01`.
- `Next()` (lines 43–51) JSON-decodes the error challenge into `{Status, Schemes, Scope}`.
- The file's doc comment points at `https://developers.google.com/gmail/xoauth2_protocol` (the old URL, lines 53–54).

**mutt** — `contrib/mutt_oauth2.py` at <https://gitlab.com/muttmua/mutt/-/raw/master/contrib/mutt_oauth2.py> (version 2020-08-07):

- `build_sasl_string()` returns `n,a=<user>,\1host=<host>\1port=<port>\1auth=Bearer <token>\1\1` for OAUTHBEARER, and `user=<user>\1auth=Bearer <token>\1\1` for XOAUTH2.
- Its Google registration uses `sasl_method: 'OAUTHBEARER'` (not XOAUTH2), with `imap_endpoint: imap.gmail.com`, `pop_endpoint: pop.gmail.com`, `smtp_endpoint: smtp.gmail.com`.

**Google's Python sample** — <https://raw.githubusercontent.com/google/gmail-oauth2-tools/master/python/oauth2.py>:

- `GenerateOAuth2String` (lines ~215–228): `'user=%s\1auth=Bearer %s\1\1'` then base64.
- `TestSmtpAuthentication` sends `AUTH XOAUTH2 <base64>`; `TestImapAuthentication` uses `imap_conn.authenticate('XOAUTH2', ...)`.

### 1.3 Required scope

- `https://mail.google.com/` is the scope for IMAP, POP, and SMTP access: "The scope for IMAP, POP, and SMTP access is `https://mail.google.com/`" (<https://developers.google.com/workspace/gmail/imap/xoauth2-protocol>; also <https://developers.google.com/workspace/gmail/imap/imap-smtp>).
- Gmail API granular scopes cannot be used for IMAP/SMTP. The same page: "To be approved, your app must show full utilization of `https://mail.google.com/`. If your app does not require `https://mail.google.com/`, migrate to the Gmail API and use more granular restricted scopes."
- `https://mail.google.com/` is classified **restricted** by Google's current list, with the parenthetical "(includes any usage of IMAP, SMTP, and POP3 protocols)" (<https://support.google.com/cloud/answer/13464325>).
- `https://www.googleapis.com/auth/gmail.imap_admin` exists but "can only be used for Google Workspace domain-wide delegation" with service accounts; it does not work for normal user flows (<https://developers.google.com/workspace/gmail/imap/xoauth2-protocol>).
- Thunderbird's provider table uses `https://mail.google.com/` for `imap`, `pop3`, and `smtp` (`OAuth2Providers.sys.mjs:15–21`).

### 1.4 Session length limits with OAuth

From "IMAP, POP, and SMTP" (<https://developers.google.com/workspace/gmail/imap/imap-smtp>), verbatim:

- "Gmail POP sessions last up to approximately 7 days. Gmail IMAP sessions last up to approximately 24 hours. If you authenticated the session using OAuth credentials, it lasts approximately the validity period of the access token used (usually 1 hour). A session in this context is one continuous TCP connection."
- "When the time elapses and the session expires, Gmail closes the connection with a message stating that the session expired. After that, the client can reconnect, authenticate again, and continue. If using OAuth, make sure that the access token used is valid (if you try to use an access token older than 1 hour, it might be invalid)."

So with OAuth the effective IMAP session is ~1 hour and must be re-established with a fresh access token. (Google's native-app doc sample response shows `expires_in: 3920`: <https://developers.google.com/identity/protocols/oauth2/native-app>.)

---

## 2. Google OAuth 2.0 for desktop/installed apps

### 2.1 Supported flow and redirect method

Primary source: "OAuth 2.0 for iOS & Desktop Apps" (<https://developers.google.com/identity/protocols/oauth2/native-app>).

- "Installed apps are distributed to individual devices, and it is assumed that these apps cannot keep secrets."
- "The main difference is that installed apps must open the system browser and supply a local redirect URI to handle responses from Google's authorization server."
- Redirect options for installed apps:
  - **Loopback IP address** — `http://127.0.0.1:port` or `http://[::1]:port`. "Query your platform for the relevant loopback IP address and start an HTTP listener on a random available port." This is "the recommended mechanism for obtaining the authorization code" for macOS, Linux, and Windows desktop apps, and the client type form value is "Desktop app".
  - `localhost` is allowed: "It is also possible to use `localhost` in place of the loopback IP, but this configuration may cause issues with client firewalls."
  - **Custom URI scheme** — documented for mobile, but "Custom URI schemes are no longer supported due to the risk of app impersonation."
  - **Manual copy/paste (OOB)** — "no longer supported".
- Loopback is deprecated only for Android, Chrome app, and iOS client types, not desktop (<https://developers.google.com/identity/protocols/oauth2/native-app>).

OOB status details ("Out-Of-Band (OOB) flow Migration Guide", <https://developers.google.com/identity/protocols/oauth2/resources/oob-migration>):

- Compliance dates: new OAuth usage blocked 2022-02-28; user-facing warning 2022-09-05; deprecated for clients created before 2022-02-28 on 2022-10-03; **all existing clients blocked 2023-01-31**.
- "This deprecation is only applicable to production apps (i.e apps with publishing status set to In Production). The flow will continue to work for apps with the Testing publishing status."
- Desktop clients are told to migrate to the loopback IP address flow.
- `redirect_uri` values `urn:ietf:wg:oauth:2.0:oob`, `urn:ietf:wg:oauth:2.0:oob:auto`, `oob` identify the dead flow.

Google's own Python sample has adapted by _not_ using OOB and _not_ using a Desktop client: its header says "NOTE: The OAuth2 OOB flow isn't a thing anymore. You will need to set the application type to 'Web application' and then add `https://google.github.io/gmail-oauth2-tools/html/oauth2.dance.html` as an authorised redirect URI" (<https://raw.githubusercontent.com/google/gmail-oauth2-tools/master/python/oauth2.py>).

### 2.2 Endpoints

Current documented endpoints:

| Purpose                           | URL                                                                                        | Source          |
| --------------------------------- | ------------------------------------------------------------------------------------------ | --------------- |
| Authorization                     | `https://accounts.google.com/o/oauth2/v2/auth` (HTTPS only; refuses plain HTTP)            | native-app page |
| Token (code exchange and refresh) | `https://oauth2.googleapis.com/token`                                                      | native-app page |
| Revocation                        | `https://oauth2.googleapis.com/revoke` (POST, token as parameter; access or refresh token) | native-app page |

Older/alternate endpoints still found in working implementations (all appear to remain functional):

- `https://accounts.google.com/o/oauth2/auth` — Thunderbird (`OAuth2Providers.sys.mjs:238`), mutt (`authorize_endpoint`), Google's Python sample (`o/oauth2/auth`).
- `https://accounts.google.com/o/oauth2/token` — Google's Python sample, mutt, and nodemailer's default `accessUrl` (`dist/esm/xoauth2/index.js:55`).
- `https://www.googleapis.com/oauth2/v3/token` — Thunderbird (`OAuth2Providers.sys.mjs:239`).

### 2.3 PKCE

From the native-app page:

- "Google supports the Proof Key for Code Exchange (PKCE) protocol to make the installed app flow more secure."
- `code_verifier`: high-entropy string, unreserved characters `[A-Z]/[a-z]/[0-9]/"-"/"."/"_"/"~"`, **43–128 characters**.
- `code_challenge` methods: `S256` (recommended) = `BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))`, or `plain`.
- In the parameter table `code_challenge` and `code_challenge_method` are marked **Recommended**, not Required. Default `code_challenge_method` is `plain` when omitted.
- RFC 7636 is the underlying spec (<https://datatracker.ietf.org/doc/html/rfc7636>).

Implementations: Thunderbird sets `usePKCE: true` for Google and sends `code_challenge_method=S256` plus a 64-char verifier (`OAuth2.sys.mjs:217–235`). mutt's `localhostauthcode` flow uses PKCE S256. Google's Python sample does **not** use PKCE.

### 2.4 Authorization parameters

The native-app page's parameter table for installed apps: `client_id` (required), `redirect_uri` (required), `response_type=code` (required), `scope` (required), `code_challenge` (recommended), `code_challenge_method` (recommended), `state` (recommended), `login_hint` (optional). Notably **`access_type` and `prompt` are not in the installed-app table**, and the page says:

- "Note that refresh tokens are always returned for installed applications." (token response table)
- "Incremental authorization is not supported for installed apps or devices." (also: "incremental authorization with installed apps is not supported due to the fact that the client cannot keep the `client_secret` confidential")

The web-server page (<https://developers.google.com/identity/protocols/oauth2/web-server>) documents the general parameters that other implementations commonly also send from desktop clients:

- `access_type`: `online` (default) or `offline`. "Set the value to `offline` if your application needs to refresh access tokens when the user is not present at the browser. ... This value instructs the Google authorization server to return a refresh token _and_ an access token the first time that your application exchanges an authorization code for tokens."
- `prompt`: space-delimited list; `none`, `consent`, `select_account`. "If you don't specify this parameter, the user will be prompted only the first time your project requests access."
- `include_granted_scopes`: enables incremental authorization (web-server context).
- `state`: recommended, CSRF mitigation; returned in the query component of `redirect_uri`.
- Node.js section note: "**Important Note** - The `refresh_token` is only returned on the first authorization."
- DPoP section: "If your application already has a refresh token for the user and you want to obtain a new DPoP-bound refresh token, the user must revoke the existing grant or you must use the `prompt=consent` parameter in the initial authorization request to ensure a new refresh token is issued."

Google's Python sample (which uses a Web application client) sends `access_type=offline` and `prompt=consent` unconditionally. Thunderbird sends neither `access_type` nor `prompt` for Google (it relies on the installed-app behavior; `OAuth2.sys.mjs:206–237`).

### 2.5 Token response and refresh

Code exchange: `POST https://oauth2.googleapis.com/token` with `client_id`, `client_secret` (**Optional** per the table), `code`, `code_verifier`, `grant_type=authorization_code`, `redirect_uri` (native-app page). Refresh: `POST https://oauth2.googleapis.com/token` with `client_id`, `client_secret` (**Optional**), `grant_type=refresh_token`, `refresh_token` (native-app page). The `client_secret` row adds: "(The `client_secret` is not applicable to requests from clients registered as Android, iOS, or Chrome applications.)" — Desktop is not in that exclusion list.

Token response fields (native-app and web-server pages):

| Field                      | Meaning                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `access_token`             | Bearer token for API/protocol calls                                                                                                        |
| `expires_in`               | Remaining access-token lifetime in seconds                                                                                                 |
| `id_token`                 | Only if an identity scope (`openid`, `profile`, `email`) was requested                                                                     |
| `refresh_token`            | Long-lived token; "Refresh tokens are valid until the user revokes access or the refresh token expires." Installed apps: "always returned" |
| `refresh_token_expires_in` | Only set for time-based access grants                                                                                                      |
| `scope`                    | Space-delimited granted scopes                                                                                                             |
| `token_type`               | "always `Bearer`, even when DPoP is used"                                                                                                  |

Refresh response: a new `access_token` + `expires_in` (+ `scope`, `token_type`); no new refresh token in the sample (<https://developers.google.com/identity/protocols/oauth2/native-app>). Store both tokens "in a secure, long-lived location" (native-app page).

Error responses:

- RFC 6749 §5.2 defines `invalid_request`, `invalid_client`, `invalid_grant`, `unauthorized_client`, `unsupported_grant_type`, `invalid_scope` (<https://datatracker.ietf.org/doc/html/rfc6749#section-5.2>).
- Google's `invalid_grant` guidance: "When refreshing an access token, the token may have expired or has been invalidated. Authenticate the user again and ask for user consent to obtain new tokens. ... Otherwise, the user account may have been deleted or disabled." (native-app and web-server pages)
- Authorization-endpoint errors include `admin_policy_enforced` (Workspace admin restriction), `disallowed_useragent` (embedded webview), `org_internal` (internal-user-type project used by an account outside the org), `deleted_client`, `redirect_uri_mismatch`, `invalid_request` (native-app and web-server pages).
- Token-endpoint `invalid_client` means "The OAuth client secret is incorrect" (web-server page).
- Revocation: `POST https://oauth2.googleapis.com/revoke?token={token}`; `200` on success, `400` with an error code otherwise; revoking an access token also revokes its refresh token; "Revocation removes all OAuth 2.0 scopes previously granted to a project" (native-app page).

Token and refresh-token limits ("Using OAuth 2.0 to Access Google APIs", <https://developers.google.com/identity/protocols/oauth2>):

- Token size caps: authorization codes 256 bytes, access tokens 2048 bytes, refresh tokens 512 bytes.
- "There is currently a limit of 100 refresh tokens per Google Account per OAuth 2.0 client ID. If the limit is reached, creating a new refresh token automatically invalidates the oldest refresh token without warning. This limit does not apply to service accounts."
- "There is also a larger limit on the total number of refresh tokens a user account or service account can have across all clients."
- Google recommends limiting to 15–20 authorized clients per Google Account for multi-device scenarios.

### 2.6 Is a Desktop app's client secret confidential?

Google's wording, from three different pages:

1. Overview, Installed applications section (<https://developers.google.com/identity/protocols/oauth2>): "The process results in a client ID and, in some cases, a client secret, which you embed in the source code of your application. **(In this context, the client secret is obviously not treated as a secret.)**"
2. "Manage OAuth Clients" (<https://support.google.com/cloud/answer/15549257>): "**Public Clients:** Native apps or JavaScript-based apps fall under this category. They cannot securely store secrets, as they reside on user devices and as such do not use client secrets."
3. Native-app page: `client_secret` is marked **Optional** in both the code-exchange and refresh parameter tables.

Related console behavior: "The console does not require any additional information to create OAuth 2.0 credentials for desktop applications" (<https://support.google.com/cloud/answer/15549257>). Since 2025 the client secret is hashed and shown only once at creation; after that the console shows only the last four characters (<https://support.google.com/cloud/answer/15549257>).

In practice the implementations read:

- Thunderbird ships a hardcoded Google client ID _and_ secret (`OAuth2Providers.sys.mjs:230–241`) and sends the secret on refresh (`OAuth2.sys.mjs:424–438`), with the comment "Don't copy these values for your own application - register one for yourself!" (`OAuth2Providers.sys.mjs:221–225`).
- aerc, mutt, and nodemailer all pass whatever `client_secret` the user configured (possibly empty) to the token endpoint (`aerc/lib/auth/sasl.go:50–57`; mutt `registrations` with empty secret; `nodemailer/dist/esm/xoauth2/index.js:207–212`).

---

## 3. Google OAuth app policy / verification

### 3.1 External user type

**Testing status** (<https://support.google.com/cloud/answer/15549945>, "Manage App Audience"):

- "Projects configured with a publishing status of **Testing** are limited to up to 100 test users listed in the OAuth consent screen."
- "Google will display a warning message before allowing a specified test user to authorize scopes requested by your project's OAuth clients."
- "Authorizations by a test user will expire seven days from the time of consent. If your OAuth client requests an `offline` access type and receives a refresh token, that token will also expire."
- **Exception, verbatim:** "The only exception to this behavior is if your app requests a subset of the following: name, email address, and user profile (through the `userinfo.email, userinfo.profile, openid` scopes or their OpenID Connect equivalents). For such requests, your users do not need to be in the trusted user list, they will not see a warning message, and their authorizations will not expire after 7 days. ... If your app requests any other OAuth scopes, then this exception does not apply."
- The overview page states the same 7-day rule and scopes it explicitly: "A Google Cloud Platform project with an OAuth consent screen configured for an **external** user type and a publishing status of 'Testing' is issued a refresh token expiring in 7 days, unless the only OAuth scopes requested are a subset of name, email address, and user profile ..." (<https://developers.google.com/identity/protocols/oauth2>).
- A test user may also be blocked by Workspace admin policy or Advanced Protection (<https://support.google.com/cloud/answer/15549945>).

**Published + Unverified (In production, verification not complete)**:

- In Production projects "are available to any user with a Google Account"; verification may still be required before the app name/logo is displayed or before sensitive/restricted scopes may be requested (<https://support.google.com/cloud/answer/15549945>).
- Unverified apps requesting sensitive/restricted scopes show the "unverified app" screen (<https://support.google.com/cloud/answer/7454865>) and are limited by the OAuth user cap: "**New user cap:** Apps that present the unverified app screen to users — 100 new users in total, after the app presents the unverified app screen." The cap "applies over the entire lifetime of the project, and it cannot be reset or changed" (<https://support.google.com/cloud/answer/15549945>; same cap restated at <https://support.google.com/cloud/answer/7454865> and <https://support.google.com/cloud/answer/13463817>).
- Exhausting the cap disables sign-in: "Failure to get your app verified before making requests to sensitive or restricted scopes will result in your project's 100 new-user cap eventually getting exhausted and Google sign-in being disabled for your users" (<https://support.google.com/cloud/answer/13463817>), shown to users as a "Sign in with Google temporarily disabled" window (<https://support.google.com/cloud/answer/7454865>).

**Verification types and timelines** (<https://support.google.com/cloud/answer/13463817>):

| Verification                  | Purpose                                                                                                                                                                                | Expected time     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Brand Verification            | identity/intent, logo, name, URLs, domain ownership                                                                                                                                    | 2–3 business days |
| Sensitive Scope Verification  | sensitive scope use, limited use, minimum scope                                                                                                                                        | 10 business days  |
| Restricted Scope Verification | restricted scope use; "An additional Security assessment is required to demonstrate a minimum level of capability in handling data securely and deleting user data upon user request." | 6 weeks           |

- "All apps that integrate with Google APIs are required to comply with Google's API Services User Data Policy regardless of whether they have been verified" (<https://support.google.com/cloud/answer/13464323>).
- Exceptions where verification is not mandatory (<https://support.google.com/cloud/answer/13464323>): Personal Use apps (fewer than 100 users), Development/Testing/Staging apps, Service-owned Data Only, Internal Use apps, and Workspace admin-trusted/marketplace-installed apps. Personal-use apps still hit the unverified-app screen and the 100-user cap.

**Restricted scope verification and security assessment** (<https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification>):

- "If you store or transmit restricted scope data on servers, then you need to complete a security assessment."
- "Every app that requests access to Google users' restricted data and **has the ability to access data from or through a third-party server** must go through a security assessment from Google-empanelled security assessors."
- The framework is CASA (Cloud Application Security Assessment) under the App Defense Alliance; assessment tiers AL1/AL2; annual revalidation; "at least every 12 months after your assessor's Letter of Assessment (LOA) approval date".
- Exceptions to verification requirements listed on that page: Personal use, Projects used in Development/Testing/Staging tiers, Service-owned data only, Internal use only, Domain-wide installation.
- "For this reason, the restricted scopes verification process can potentially take several weeks to complete."

More on the assessment (<https://support.google.com/cloud/answer/13465431>): annual; AL1/AL2 assurance levels; assessors are independent and paid by the developer ("Google does not charge the developer any fees for security assessment"); LOV (FAQ calls it Letter of Validation / Letter of Assessment). Required security measures per the Workspace policy include encrypting tokens at rest, using HTTPS, key management, and following CASA (<https://developers.google.com/workspace/workspace-api-user-data-developer-policy>, "Maintain a secure operating environment").

Narrow-scope and review requirements (<https://support.google.com/cloud/answer/13464321>): request only the narrowest scopes; provide a written justification for why narrower scopes do not work; provide a demonstration video showing the OAuth grant and each requested scope's functionality; all restricted-scope apps must submit to the annual security assessment.

### 3.2 Internal user type (Google Workspace)

- Internal projects are "associated with a Google Cloud Organization" and "limit authorization requests to members of the organization". Authorization from outside the org yields `org_internal` (<https://support.google.com/cloud/answer/15549945>).
- "User authorization of scopes associated with restricted Google Workspace services, including high-risk Gmail and Drive scopes, might require additional configuration by your organization's administrators" — admin allowlisting (<https://support.google.com/cloud/answer/15549945>, linking to <https://support.google.com/a/answer/7281227#homegrown>).
- Internal-use apps are not subject to the unverified-app screen or the 100-user cap, but only org users can use them (<https://support.google.com/cloud/answer/13464323>).
- API policy note: "If your app is only used by users within your own domain, then these requirements do not apply" (<https://developers.google.com/terms/api-services-user-data-policy>).
- The 7-day Testing refresh-token rule is written for **external** user type only (<https://developers.google.com/identity/protocols/oauth2>; <https://support.google.com/cloud/answer/15549945>). No page consulted states a 7-day expiry for internal user type.

### 3.3 What Google says about apps requesting `https://mail.google.com/`

- Scope is required for IMAP/POP/SMTP, and the app "must comply with the Google API Services User Data Policy"; "To be approved, your app must show full utilization of `https://mail.google.com/`"; otherwise "migrate to the Gmail API and use more granular restricted scopes" (<https://developers.google.com/workspace/gmail/imap/xoauth2-protocol>).
- The verification FAQ's IMAP/SMTP section (<https://support.google.com/cloud/answer/13463817>) is the sharpest statement:
  - "Yes, because IMAP and SMTP usage requires using `https://mail.google.com/`, you will need to submit your app for the restricted scope verification for this determination. If your usage of IMAP/SMTP is deemed to violate the minimum scope policy within the verification process, you will need to migrate to using the Gmail API."
  - "note that the `https://mail.google.com/` scope should only be requested if your application also needs to immediately and permanently delete threads and messages, bypassing Trash; all other actions can be performed with less permissive scopes. If your app does not do this, you will need to migrate to the Gmail API and request less permissive scopes."
  - "If your app uses SMTP protocol only, note that using the broad access `https://mail.google.com/` scope just for sending emails with the SMTP protocol violates the minimum scope policy. To use the Gmail API and continue with the verification process, you will need to migrate off SMTP protocol and use the sensitive `https://www.googleapis.com/auth/gmail.send` scope instead."
- The Workspace user data and developer policy lists approved Gmail scope use cases, including: "Built-in and web email clients that allow users to compose, send, read, and process email via a user interface." (<https://developers.google.com/workspace/workspace-api-user-data-developer-policy>, "Appropriate access to and use of Gmail Scopes"). That policy also defines Workspace Restricted scopes as any Gmail API scope permitting read/create/modify of message bodies/metadata/headers, etc.
- The verification requirements page states the minimum-scope test directly: "You must provide a detailed justification for your requested scope(s) which should include an explanation why narrower scopes would not work" (<https://support.google.com/cloud/answer/13464321>).

### 3.4 Do refresh tokens in "In production" status expire?

Yes, under the conditions listed by the OAuth overview (<https://developers.google.com/identity/protocols/oauth2>, "Refresh token expiration"). A granted refresh token might stop working when:

- The user has revoked the app's access.
- "The refresh token has not been used for six months."
- "The user changed passwords and the refresh token contains Gmail scopes."
- "The user account has exceeded a maximum number of granted (live) refresh tokens."
- The user granted time-based access and it expired.
- An admin set any requested service to Restricted (`admin_policy_enforced`).
- For GCP APIs, a Cloud session-control policy expired the session (errors as `invalid_grant`, sometimes with `error_subtype` such as `invalid_rapt`).

The 100-refresh-tokens-per-account-per-client limit and the older-token-invalidation behavior are in the same section (quoted in §2.5).

---

## 4. Reference implementations

### 4.1 aerc (local checkout)

**Does aerc ship its own OAuth client? No.** Users must create their own Google Cloud OAuth client and obtain a refresh token out of band, then put the client credentials and refresh token in the account URL.

- Account URL grammar: `source = <scheme>://<username>[:<password>]@<hostname>[:<port>]?[<oauth2_params>]`; `imaps+oauthbearer` and `imaps+xoauth2` are supported; params are `token_endpoint`, `client_id`, `client_secret`, `scope` (`/home/ulezot/Projects/other/aerc/doc/aerc-imap.5.scd:26, 49–69`). SMTP mirrors this: `smtps+oauthbearer` / `smtps+xoauth2` (`doc/aerc-smtp.5.scd:51–56`).
- Semantics: "If specified and a `token_endpoint` is provided, the configured password is used as a refresh token to obtain an access token. If `token_endpoint` is omitted, refresh token exchange is skipped, and the password acts like an access token instead." (`doc/aerc-imap.5.scd:54–57`)
- Implementation: `lib/auth/sasl.go:48–71` builds a `golang.org/x/oauth2.Config` from the URL query (`client_id`, `client_secret`, `scope` split on spaces, `token_endpoint`), exchanges the password (refresh token) for an access token, then uses `NewXoauth2Client` or `sasl.NewOAuthBearerClient`.
- Refresh: `lib/auth/token.go:13–18` sets `token.RefreshToken` and calls `TokenSource(...).Token()`; `40–63` first tries a cached refresh token, then exchanges, then saves `token.RefreshToken`.
- Token storage: `$XDG_CACHE_HOME/aerc/<account>-<mech>.token`, directory mode `0700`, file mode `0600` (`lib/auth/token.go:20–30`). Only the refresh token is cached, not the access token.
- Failure: if the cached refresh token fails, the error says "try deleting `<cache path>`" (`lib/auth/token.go:52–58`).
- The account wizard only constructs the URI and offers `SSL/TLS+OAUTHBEARER` / `SSL/TLS+XOAUTH2` transports; it does not run a browser flow or ask for client credentials (`app/account-wizard.go:164–175, 635–641, 685–689`).
- In-repo docs contain no Gmail OAuth walkthrough. The official wiki's Gmail page recommends the app-password route instead: "The simplest way to get started is to enable 2FA and create an app password for aerc" (<https://man.sr.ht/~rjarry/aerc/providers/gmail.md>). Third-party guides fill the OAuth gap by having the user create a client and generate a refresh token (e.g. <https://tilde.club/~djhsu/aerc-gmail-oauth2.html>, which says "select Web application instead of Desktop app" so that Google's Python script's hosted redirect URI can be registered; and <https://dennisc.net/writing/tech/gmail-aerc>, which uses the OAuth 2.0 Playground and notes the current token endpoint is `https://oauth2.googleapis.com/token`).
- History: XOAUTH2 support was restored in a later release ("Restored XOAUTH2 support for IMAP and SMTP", `CHANGELOG.md:662`); oauthbearer for SMTP arrived in 0.5.0 (`CHANGELOG.md:868`).

### 4.2 Google's Python sample (`gmail-oauth2-tools`)

Source: <https://raw.githubusercontent.com/google/gmail-oauth2-tools/master/python/oauth2.py> (linked from <https://developers.google.com/workspace/gmail/imap/xoauth2-libraries>).

- Client ownership: user registers an OAuth app and passes `--client_id` / `--client_secret`. The header now instructs setting application type **Web application** and registering `https://google.github.io/gmail-oauth2-tools/html/oauth2.dance.html` as an authorized redirect URI, because OOB no longer works.
- Flow: prints an authorization URL (`https://accounts.google.com/o/oauth2/auth` with `access_type=offline`, `prompt=consent`), the user visits it, then pastes the code back into the script (`GeneratePermissionUrl`, `AuthorizeTokens`).
- Refresh: POST `https://accounts.google.com/o/oauth2/token` with `client_id`, `client_secret`, `refresh_token`, `grant_type=refresh_token`.
- SASL string: `user=%s\1auth=Bearer %s\1\1`, base64-encoded; default scope `https://mail.google.com/`.
- The page's other sample is JavaMail 1.5.2+, which "natively supports OAuth for IMAP" (<https://developers.google.com/workspace/gmail/imap/xoauth2-libraries>).

### 4.3 mutt (`mutt_oauth2.py`)

Source: <https://gitlab.com/muttmua/mutt/-/raw/master/contrib/mutt_oauth2.py> (version 2020-08-07).

- Client ownership: user-supplied; the `google` registration has `client_id: ''` and `client_secret: ''` placeholders. Header comment: "The token file must be encrypted because it contains multi-use bearer tokens whose usage does not require additional verification."
- Google registration: authorize endpoint `https://accounts.google.com/o/oauth2/auth`, device endpoint `https://oauth2.googleapis.com/device/code`, token endpoint `https://accounts.google.com/o/oauth2/token`, default redirect `urn:ietf:wg:oauth:2.0:oob` (legacy), IMAP `imap.gmail.com`, POP `pop.gmail.com`, SMTP `smtp.gmail.com`, SASL method `OAUTHBEARER`, scope `https://mail.google.com/`.
- Flows offered: `authcode` (OOB), `localhostauthcode` (binds `127.0.0.1:<random port>`, uses PKCE S256 with a 90-char verifier and an embedded HTTP server), `devicecode` (device authorization grant with polling).
- Token storage: JSON token file encrypted through user-configured GPG pipes (`ENCRYPTION_PIPE` / `DECRYPTION_PIPE`), file mode enforced `0600`.
- Refresh: if the stored access token is expired, POST the token endpoint with `client_secret`, `refresh_token`, `grant_type=refresh_token`; on error prints the OAuth error and "Perhaps refresh token invalid. Try running once with `--authorize`".
- SASL string for Google: OAUTHBEARER (`n,a=...\1host=...\1port=...\1auth=Bearer ...\1\1`); the script also has an XOAUTH2 branch used by the Microsoft registration.

### 4.4 Thunderbird

Thunderbird **ships its own OAuth client credentials** for major providers, including Google.

- `OAuth2Providers.sys.mjs` (raw URL: <https://raw.githubusercontent.com/mozilla/releases-comm-central/HEAD/mailnews/base/src/OAuth2Providers.sys.mjs>):
  - `GOOGLE_SCOPES` lines 15–21: `imap`, `pop3`, `smtp` all `https://mail.google.com/`.
  - Hostname mapping lines 68–77: `gmail.com` / `googlemail.com` → issuer `accounts.google.com`.
  - Issuer entry lines 228–241: hardcoded `clientId: "406964657835-aq8lmia8j95dhl1a2bvharmfk3t1hgqj.apps.googleusercontent.com"`, `clientSecret: "kSmqreRr0qwBWJgbf5Y-PjSU"`, `authorizationEndpoint: "https://accounts.google.com/o/oauth2/auth"`, `tokenEndpoint: "https://www.googleapis.com/oauth2/v3/token"`, `usePKCE: true`, `useExternalBrowser: true`.
  - Comment above the map (lines 221–225): "For the moment these details are hard-coded, since dynamic client registration is not yet supported. Don't copy these values for your own application - register one for yourself! This code (and possibly even the registration itself) will disappear when this is switched to dynamic client registration."
- `OAuth2.sys.mjs` (raw URL: <https://raw.githubusercontent.com/mozilla/releases-comm-central/HEAD/mailnews/base/src/OAuth2.sys.mjs>):
  - Default redirect: `http://127.0.0.1` (lines 111–113).
  - PKCE: `code_challenge_method=S256` with a 64-char verifier (lines 217–235); `state` is generated and appended at lines 217–218 and validated in `checkResultURL` (lines 327–330).
  - No `access_type`/`prompt` parameters for Google; the authorization request has `response_type`, `client_id`, `scope`, `state`, and PKCE only (lines 206–237).
  - Code exchange: `grant_type=authorization_code`, `redirect_uri`, `code_verifier` (lines 440–450). Refresh: `grant_type=refresh_token`, `refresh_token`, with `client_id` and `client_secret` (lines 424–438). Stores `result.refresh_token` when present (lines 502–503).
  - Uses the external browser (`useExternalBrowser`), which is the documented installed-app requirement.
- Thunderbird's developer docs confirm: "Thunderbird has built-in credentials and endpoint information for the major email providers." (<https://source-docs.thunderbird.net/en/latest/backend/oauth.html>)

### 4.5 Common patterns across implementations

|                           | aerc                                                | mutt                                           | Google Python sample                     | Thunderbird                 |
| ------------------------- | --------------------------------------------------- | ---------------------------------------------- | ---------------------------------------- | --------------------------- |
| Who owns the OAuth client | user                                                | user                                           | user                                     | vendor (shipped)            |
| Client type recommended   | any                                                 | Web/Desktop (script's default redirect is OOB) | Web application (per current header)     | Desktop-style, built-in     |
| Browser flow              | none; refresh token obtained externally             | manual code, loopback+PKCE, or device code     | hosted redirect page + manual code paste | external browser + loopback |
| Token storage             | refresh token in `$XDG_CACHE_HOME/aerc/…` mode 0600 | GPG-encrypted file, mode 0600                  | user records tokens manually             | Thunderbird login manager   |
| Refresh                   | `x/oauth2` TokenSource per connection               | explicit POST when access token expired        | explicit POST                            | explicit POST               |
| Failure handling          | error tells user to delete cache                    | error tells user to re-run `--authorize`       | script exits with error                  | logs error, re-auth prompt  |

---

## 5. Library specifics (installed source)

### 5.1 imapflow 2.0.2

`/home/ulezot/Projects/js/vingroto/packages/server/node_modules/imapflow` (version from `package.json:3`).

- API: `auth.accessToken?: string` — "OAuth2 access token, if using OAuth2 authentication" (`dist/esm/types.d.ts:18–29`). There is **no** refresh callback or token-source hook in `AuthOptions`; the token is a static string passed to `AUTHENTICATE` (`dist/esm/imap-flow.js:1523–1525`).
- Mechanism choice: `accessToken` triggers OAuth; OAUTHBEARER is preferred when advertised, otherwise `AUTH=XOAUTH` / `AUTH=XOAUTH2` (`dist/esm/commands/authenticate.js:191–208`).
- XOAUTH2 handshake (lines 55–88): base64 payload `user=<user>\x01auth=Bearer <token>\x01\x01` sent as `AUTHENTICATE XOAUTH2 <base64>`; on `+` the base64 JSON error is parsed into `err.oauthError` and the empty breaker is sent.
- Failure surface: `AuthenticationFailure` with `authenticationFailed`, `serverResponseCode`, `response`, and `oauthError` (`dist/esm/errors.d.ts:64` and `commands/authenticate.js:9–20`). A failed or expired token means reconnect with a new token; the library never refreshes.
- OAUTHBEARER support builds the RFC 7628 payload with the live `host`/`port` (lines 34–53). Gmail's documented capability list advertises `AUTH=XOAUTH2 AUTH=XOAUTH`, so on Gmail the XOAUTH2 branch is expected.
- README only mentions OAuth2 in the EmailEngine blurb: "managed OAuth2" (<https://github.com/postalsys/imapflow> and local `README.md:86`). CHANGELOG notes: "Added support for XOAUTH2 and OAUTHBEARERTOKEN authentication mechanisms" (1.0.27, `CHANGELOG.md:1363`) and "Better support for XOAUTH2" (1.0.45, `CHANGELOG.md:1308`).

### 5.2 nodemailer 10.0.7

`/home/ulezot/Projects/js/vingroto/packages/server/node_modules/nodemailer` (version from `package.json:3`).

- Transport auth selection: `auth.type: 'OAuth2'` (case-insensitive) constructs an `XOAuth2` instance and returns auth method `XOAUTH2` (`dist/esm/smtp-transport/index.js:71–86`). Required: `user` (or `service`).
- Options (`dist/esm/xoauth2/index.d.ts:26–65`): `user`, `clientId`, `clientSecret`, `refreshToken`, `accessToken`, `accessUrl` (default `https://accounts.google.com/o/oauth2/token`, `index.js:55`), `expires` (absolute ms timestamp), `timeout` (seconds), `provisionCallback`, `privateKey`/`serviceClient`/`scope` (service-account flow), `customHeaders`, `customParams`, `tls`.
- Automatic refresh behavior (`dist/esm/xoauth2/index.js`):
  - `getToken(renew, cb)` reuses `accessToken` when `renew` is false and it has not expired (lines 75–83). Without `provisionCallback`, `refreshToken`, or `serviceClient`, it can only reuse and otherwise errors with `EOAUTH2` "Can't create new access token for user" (lines 85–102).
  - Renewal is deduplicated: concurrent requests queue behind one in-flight renewal (lines 103–131).
  - `generateToken` POSTs `client_id`, `client_secret`, `refresh_token`, `grant_type=refresh_token` to `accessUrl` (lines 200–219), parses `access_token`/`expires_in` (lines 270–273), and surfaces `data.error`/`error_description` as an `EOAUTH2` error (lines 257–269).
  - `provisionCallback(user, renew, cb)` completely replaces token generation; `renew=true` signals "existing token failed and needs to be renewed"; the callback returns `(err, accessToken, expires)` where `expires` is in **milliseconds** (lines 12–19, 132–140).
  - `updateToken`/`timeout` semantics: `expires` is a ms timestamp; `timeout` is seconds from now (lines 59–65, 153–162). A `'token'` event is emitted with `{user, accessToken, expires}`.
  - SMTP failure path: on a `334` continuation after `AUTH XOAUTH2`, nodemailer calls `_handleXOauth2Token(true, ...)` once to force renewal; if it fails again (`isRetry`), it gives up (`dist/esm/smtp-connection/index.js:1434–1450`). The initial attempt calls `_handleXOauth2Token(false, ...)` (line 495) and sends `AUTH XOAUTH2 <base64>` (line 1627).
- `buildXOAuth2Token` uses the same Google format (`index.js:285–288`).
- CHANGELOG notes relevant to OAuth2: strict TLS by default for OAuth2 token endpoints (`CHANGELOG.md:178`, and 8.x fix at `:217`); "resolve oauth2_provision_cb at send time for non-pooled SMTP transports" (`:193`); "handle multiple XOAUTH2 token requests correctly" (`:347`); older notes on renewal logging (`:695`) and the original built-in OAuth2 announcement (`:854`).
- The README defers Gmail OAuth2 setup to EmailEngine: "If the blocker is OAuth2 setup rather than Gmail itself, EmailEngine handles the OAuth2 flow and token refresh for you" (`README.md:29`). The dedicated docs page (`https://nodemailer.com/smtp/oauth2/`) timed out during this research; behavior above is taken from the shipped source.

---

## 6. Google Cloud console setup steps for a "Desktop app" client

Synthesized from official docs; each step cited.

1. **Create or select a Google Cloud project.** The API Library flow says "If prompted, select a project, or create a new one" (<https://developers.google.com/identity/protocols/oauth2/native-app>); the Clients page prompts you to create a project if none is selected (<https://support.google.com/cloud/answer/15549257>). Gmail quickstart prerequisite: "A Google Cloud project" (<https://developers.google.com/workspace/gmail/api/quickstart/nodejs>).
2. **Configure the OAuth consent screen / Google Auth Platform.** On the Google Auth Platform overview page click "GET STARTED" and provide App Information (app name, user support email), Audience, and Contact Information (<https://support.google.com/cloud/answer/15544987>). In the Gmail quickstart this is: Menu > Google Auth platform > Branding, then Get Started → App name → user support email → Audience (Internal for a Workspace-only app; the quickstart chooses Internal) → contact email → agree to the User Data Policy → Create (<https://developers.google.com/workspace/gmail/api/quickstart/nodejs>).
3. **Choose user type and add test users.** External makes the app available to any Google Account, subject to publishing status; Internal limits it to the Cloud Organization (<https://support.google.com/cloud/answer/15549945>). For Testing status, add up to 100 test users on the Audience page; each test user sees a warning and their authorization (including offline refresh tokens) expires in 7 days (<https://support.google.com/cloud/answer/15549945>).
4. **Create the OAuth client.** Go to Menu > Google Auth platform > Clients, click Create Client, choose Application type > **Desktop app**, enter a name, click Create (<https://developers.google.com/workspace/gmail/api/quickstart/nodejs>; application-type list at <https://support.google.com/cloud/answer/15549257>). "The console does not require any additional information to create OAuth 2.0 credentials for desktop applications" (<https://support.google.com/cloud/answer/15549257>).
5. **Save the credentials immediately.** "The newly created credential appears under 'OAuth 2.0 Client IDs.' Save the downloaded JSON file as `credentials.json`" (<https://developers.google.com/workspace/gmail/api/quickstart/nodejs>). The client secret "will only be shown after you create the client. Store this information in a secure place ... because it will not be visible or accessible again" (<https://support.google.com/cloud/answer/15549257>; web-server page says the same and calls the file `client_secret.json`: <https://developers.google.com/identity/protocols/oauth2/web-server>).
6. **When testing, remember the constraints:** unverified apps show the "unverified app" screen and carry the 100-new-user cap (<https://support.google.com/cloud/answer/7454865>); Testing-status authorizations and refresh tokens expire after 7 days unless the only scopes are name/email/profile (<https://support.google.com/cloud/answer/15549945>); OOB redirects are blocked for production apps (<https://developers.google.com/identity/protocols/oauth2/resources/oob-migration>).
7. **Before public release:** restricted-scope verification is required for `https://mail.google.com/` (<https://support.google.com/cloud/answer/13463817>); expect brand verification first, then restricted scope review (6 weeks) and likely CASA security assessment (<https://support.google.com/cloud/answer/13463817>, <https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification>).

Note on client type for testing tools: Google's Python sample now explicitly says to use **Web application** (not Desktop app) so that a hosted redirect page can be registered (<https://raw.githubusercontent.com/google/gmail-oauth2-tools/master/python/oauth2.py>); several aerc community guides repeat that trick. The supported desktop flow per Google's docs remains loopback with a Desktop app client.

---

## Facts that change the design

These are the load-bearing constraints from the sources above.

1. **`https://mail.google.com/` is the only scope that works for Gmail IMAP/SMTP, and it is restricted.** There is no granular alternative for the protocols; Google tells apps that don't need it to move to the Gmail API (<https://developers.google.com/workspace/gmail/imap/xoauth2-protocol>, <https://support.google.com/cloud/answer/13464325>).
2. **Public distribution means restricted-scope verification, and the bar is "full utilization" of the full mail scope.** Google's FAQ says `mail.google.com` should only be requested by apps that "need to immediately and permanently delete threads and messages, bypassing Trash"; SMTP-only usage violates the minimum-scope policy and should use `gmail.send` via the Gmail API instead (<https://support.google.com/cloud/answer/13463817>). Separately, "Built-in and web email clients that allow users to compose, send, read, and process email via a user interface" is an explicitly approved Gmail scope use case (<https://developers.google.com/workspace/workspace-api-user-data-developer-policy>). How the verification team reconciles the permanent-delete test with the full-client use case is not documented.
3. **Verification includes a likely CASA security assessment.** Restricted-scope review is ~6 weeks; apps that can access restricted data "from or through a third-party server" need an annual security assessment (CASA, AL1/AL2) (<https://support.google.com/cloud/answer/13463817>, <https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification>).
4. **Testing status is not a viable product mode: 100 test users and a 7-day refresh-token lifetime** for any scope set other than name/email/profile (<https://support.google.com/cloud/answer/15549945>, <https://developers.google.com/identity/protocols/oauth2>). Testing is viable only for development and small private groups.
5. **Published-but-unverified is capped at 100 new users for the project's lifetime, cannot be reset, and eventually disables sign-in** (<https://support.google.com/cloud/answer/7454865>, <https://support.google.com/cloud/answer/15549945>, <https://support.google.com/cloud/answer/13463817>).
6. **Internal user type avoids verification and the cap, but only works for members of a Google Workspace/Cloud Identity organization** whose admin may additionally need to allowlist high-risk Gmail scopes; the 7-day refresh rule is written for external apps only (<https://support.google.com/cloud/answer/15549945>, <https://support.google.com/cloud/answer/13464323>, <https://developers.google.com/identity/protocols/oauth2>).
7. **The supported desktop flow is loopback (`http://127.0.0.1:<port>` / `http://[::1]:<port>`, or `localhost` with firewall caveats) with a Desktop app client, PKCE recommended, opened in the system browser.** OOB is dead for production (blocked 2023-01-31) and custom URI schemes are unsupported (<https://developers.google.com/identity/protocols/oauth2/native-app>, <https://developers.google.com/identity/protocols/oauth2/resources/oob-migration>).
8. **For installed apps Google says refresh tokens are always returned and does not list `access_type`/`prompt` in the parameter table; the web-server docs say a refresh token is only returned on first authorization and `prompt=consent` forces a new one.** Implementations differ: Google's Python sample always sends `access_type=offline&prompt=consent`; Thunderbird sends neither (<https://developers.google.com/identity/protocols/oauth2/native-app>, <https://developers.google.com/identity/protocols/oauth2/web-server>, Google Python sample, `OAuth2.sys.mjs:206–237`).
9. **Incremental authorization is explicitly not supported for installed apps** (<https://developers.google.com/identity/protocols/oauth2/native-app>).
10. **The Desktop client secret is not treated as confidential by Google** ("obviously not treated as a secret"; native apps are public clients that "do not use client secrets"; `client_secret` is Optional in the token tables). Two ownership models exist in the field: a vendor-shipped client (Thunderbird hardcodes its own ID and secret and warns against copying it) and a user-supplied client (aerc and mutt require the user to register an app). A user-supplied client also places the app in the personal-use exception (fewer than 100 users) if no verification is done (<https://developers.google.com/identity/protocols/oauth2>, <https://support.google.com/cloud/answer/15549257>, <https://support.google.com/cloud/answer/13464323>, Thunderbird source).
11. **Access tokens last ~1 hour and OAuth IMAP sessions last ~the access-token lifetime**, not the 24-hour session limit; the client must refresh and reconnect (<https://developers.google.com/workspace/gmail/imap/imap-smtp>).
12. **Refresh tokens die on user revoke, 6 months of non-use, password change when Gmail scopes are involved, and token-count limits; a client that gets `invalid_grant` must re-run the consent flow** (<https://developers.google.com/identity/protocols/oauth2>).
13. **Library gaps shape the implementation:**
    - imapflow takes a static `accessToken` and has no refresh hook; token lifecycle must live in the daemon, which reconnects with a fresh token (`imapflow/dist/esm/types.d.ts:18–29`, `dist/esm/imap-flow.js:1523–1525`).
    - nodemailer can auto-refresh from `clientId`/`clientSecret`/`refreshToken`, but its default token endpoint is the legacy `https://accounts.google.com/o/oauth2/token`; a custom `provisionCallback` or explicit `accessUrl` is available (`nodemailer/dist/esm/xoauth2/index.js:55, 75–144`, `index.d.ts:26–65`).
14. **Tokens are sensitive at rest.** mutt refuses to store them unencrypted; Google's Workspace policy lists "Keeping user data and credentials, specifically tokens such as OAuth access and refresh tokens, encrypted at rest" as a required security measure for restricted scopes (<https://gitlab.com/muttmua/mutt/-/raw/master/contrib/mutt_oauth2.py>, <https://developers.google.com/workspace/workspace-api-user-data-developer-policy>). The vingroto daemon already owns the OS keyring, which is the natural home for refresh tokens.
15. **OAuth client credentials are console-provisioned and shown once.** Since 2025 the client secret is hashed and only visible at creation; inactive clients are auto-deleted after six months (<https://support.google.com/cloud/answer/15549257>). Any shipped-client model must cope with a secret that can't be rotated silently, and a user-supplied-client model needs onboarding UX for creating the client and pasting ID/secret.

---

## Open questions

1. **CASA applicability to a local-only daemon.** The restricted-scope page says assessment is required for apps with "the ability to access data from or through a third-party server" and "If you store or transmit restricted scope data on servers", while the Workspace policy says restricted-scope apps must follow CASA and may be required to undergo assessment "depending on the API being accessed and number of user grants or users". No page read states explicitly whether an app whose data never leaves the user's device (only Google's servers are contacted) is exempt from the assessment. Needs confirmation from the Google verification team before relying on it.
2. **Whether `access_type=offline` / `prompt=consent` are needed for Desktop clients.** The native-app docs say refresh tokens are always returned and omit both parameters; the web-server docs say a refresh token is only returned on the first authorization and `prompt=consent` forces a new one. The exact behavior when re-adding the same Google account with an existing grant (no `prompt`) is not documented for the Desktop client type.
3. **Whether Google rejects a Desktop-app token exchange that omits `client_secret`.** Docs mark it Optional; every implementation examined sends one. Not verified against the live endpoint.
4. **Whether `http://localhost:<port>` (rather than `127.0.0.1`) is accepted for a Desktop app client in the Cloud console and at runtime.** The docs say localhost "may cause issues with client firewalls" but do not state whether the console accepts it as an authorized redirect for Desktop type.
5. **Internal user type and refresh-token lifetime.** The 7-day rule is explicitly external; no page states the equivalent policy for internal apps, so it is unknown whether an internal Testing app gets normal-lifetime refresh tokens.
6. **The exact error returned when a Testing-status refresh token hits the 7-day expiry.** The docs say the authorization expires; the `invalid_grant` guidance is generic.
7. **Whether Gmail advertises `AUTH=OAUTHBEARER`.** Google's documented capability line shows only `AUTH=XOAUTH2 AUTH=XOAUTH`; imapflow prefers OAUTHBEARER when present. The live capability list was not captured in this research.
8. **What exactly the downloaded Desktop-app JSON contains** (field names such as `installed.client_id`/`client_secret`/`auth_uri`/`token_uri`) is not documented on the pages read; only "Save the downloaded JSON file" is stated (<https://developers.google.com/workspace/gmail/api/quickstart/nodejs>).
9. **DPoP is now recommended by Google** (optional in the protocol, "recommended for increased security") and changes refresh semantics for DPoP-bound refresh tokens (proof required on refresh; `use_dpop_nonce` handling). The desktop-app page's treatment suggests it is optional, but a fresh integration in 2026 may face expectations here; not investigated further because it is orthogonal to basic XOAUTH2 (<https://developers.google.com/identity/protocols/oauth2/native-app>).
10. **Whether the unverified-app 100-new-user cap and the Testing 100-test-user cap interact or compose** (they are described separately: test-user list vs new-user cap). No page read describes the combined behavior for a Testing app that later publishes unverified.
