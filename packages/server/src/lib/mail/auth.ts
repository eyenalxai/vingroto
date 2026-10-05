import type { AccountConfig } from "@vingroto/core/config/schema"
import type { AccountId } from "@vingroto/core/ids"
import type { ActionFailure, SyncFailure } from "@vingroto/core/protocol/mail"
import type * as Effect from "effect/Effect"
import type { AuthOptions } from "imapflow"
import type { SMTPTransportOptions } from "nodemailer"

import type { Credential, CredentialError } from "@/lib/credential/service"
import type { OAuthShape } from "@/lib/oauth"
import type { OAuthError } from "@/lib/oauth/errors"

import { passwordReference } from "@/lib/credential/refs"

type SmtpAuth = NonNullable<SMTPTransportOptions["auth"]>

interface AccountSecretDeps {
  readonly credential: Credential["Service"]
  readonly oauth: OAuthShape
}

// Why: IMAP and SMTP both pick the secret from the account's auth method, and that pick must not drift.
const accountSecret = (
  deps: AccountSecretDeps,
  account: AccountConfig,
): Effect.Effect<string, CredentialError | OAuthError> =>
  account.auth === "oauth2"
    ? deps.oauth.accessToken(account)
    : deps.credential.get(passwordReference(account.id))

const imapAuthFor = (account: AccountConfig, username: string, secret: string): AuthOptions =>
  account.auth === "oauth2"
    ? { user: username, accessToken: secret }
    : { user: username, pass: secret }

const smtpAuthFor = (account: AccountConfig, username: string, secret: string): SmtpAuth =>
  account.auth === "oauth2"
    ? { type: "OAuth2", user: username, accessToken: secret }
    : { user: username, pass: secret }

const oauthActionFailure = (
  accountId: AccountId,
  mailboxPath: string,
  error: OAuthError,
): ActionFailure => ({
  _tag: "oauth",
  accountId,
  mailboxPath,
  message: error.message,
  reauthorizationRequired: error._tag === "OAuthReauthorizationRequired",
})

const oauthSyncFailure = (accountId: AccountId, error: OAuthError): SyncFailure => ({
  _tag: "oauth",
  accountId,
  message: error.message,
  reauthorizationRequired: error._tag === "OAuthReauthorizationRequired",
})

export { accountSecret, imapAuthFor, oauthActionFailure, oauthSyncFailure, smtpAuthFor }
