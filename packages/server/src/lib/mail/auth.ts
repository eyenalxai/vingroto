import type { AccountConfig } from "@vingroto/core/config/schema"
import type { AccountId } from "@vingroto/core/ids"
import type { ActionFailure, SyncFailure } from "@vingroto/core/protocol/mail"
import type { AuthOptions } from "imapflow"
import type { SMTPTransportOptions } from "nodemailer"

import type { OAuthError } from "@/lib/oauth/errors"

type SmtpAuth = NonNullable<SMTPTransportOptions["auth"]>

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

export { imapAuthFor, oauthActionFailure, oauthSyncFailure, smtpAuthFor }
