import type { AccountConfig } from "@vingroto/core/config/schema"

import { AccountId } from "@vingroto/core/ids"
import { describe, expect, test } from "bun:test"

import { imapAuthFor, oauthActionFailure, oauthSyncFailure, smtpAuthFor } from "@/lib/mail/auth"
import { OAuthAuthorizationFailed, OAuthReauthorizationRequired } from "@/lib/oauth/errors"

const alpha = AccountId.make("alpha@example.com")
const username = "alpha@example.com"

const baseAccount = {
  id: alpha,
  label: "Alpha",
  email: alpha,
  saveSent: true,
  imap: { host: "imap.gmail.com", port: 993, security: "tls" as const },
  smtp: { host: "smtp.gmail.com", port: 465, security: "tls" as const },
}

const oauthAccount: AccountConfig = {
  ...baseAccount,
  auth: "oauth2",
  oauth: { provider: "gmail", clientId: "alpha-client.apps.googleusercontent.com" },
}

const passwordAccount: AccountConfig = {
  ...baseAccount,
  auth: "password",
}

describe("mail auth objects", () => {
  test("an oauth account connects to imap with an access token", () => {
    expect(imapAuthFor(oauthAccount, username, "at-1")).toEqual({
      user: username,
      accessToken: "at-1",
    })
  })

  test("a password account connects to imap with username and password", () => {
    expect(imapAuthFor(passwordAccount, username, "app-password")).toEqual({
      user: username,
      pass: "app-password",
    })
  })

  test("an oauth account sends with smtp OAuth2 and an access token", () => {
    expect(smtpAuthFor(oauthAccount, username, "at-1")).toEqual({
      type: "OAuth2",
      user: username,
      accessToken: "at-1",
    })
  })

  test("a password account sends with smtp username and password", () => {
    expect(smtpAuthFor(passwordAccount, username, "app-password")).toEqual({
      user: username,
      pass: "app-password",
    })
  })
})

describe("oauth failure mapping", () => {
  test("a revoked grant maps to an action failure that requires re-authorization", () => {
    expect(
      oauthActionFailure(
        alpha,
        "INBOX",
        new OAuthReauthorizationRequired({ message: "the Google authorization expired" }),
      ),
    ).toEqual({
      _tag: "oauth",
      accountId: alpha,
      mailboxPath: "INBOX",
      message: "the Google authorization expired",
      reauthorizationRequired: true,
    })
  })

  test("another oauth failure maps to an action failure with its message", () => {
    expect(
      oauthActionFailure(
        alpha,
        "INBOX",
        new OAuthAuthorizationFailed({ message: "Google rejected the token refresh" }),
      ),
    ).toEqual({
      _tag: "oauth",
      accountId: alpha,
      mailboxPath: "INBOX",
      message: "Google rejected the token refresh",
      reauthorizationRequired: false,
    })
  })

  test("a revoked grant maps to a sync failure that requires re-authorization", () => {
    expect(
      oauthSyncFailure(alpha, new OAuthReauthorizationRequired({ message: "expired" })),
    ).toEqual({
      _tag: "oauth",
      accountId: alpha,
      message: "expired",
      reauthorizationRequired: true,
    })
  })

  test("another oauth failure maps to a sync failure with its message", () => {
    expect(
      oauthSyncFailure(
        alpha,
        new OAuthAuthorizationFailed({ message: "token endpoint unreachable" }),
      ),
    ).toEqual({
      _tag: "oauth",
      accountId: alpha,
      message: "token endpoint unreachable",
      reauthorizationRequired: false,
    })
  })
})
