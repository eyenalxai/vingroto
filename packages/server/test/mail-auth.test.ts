import type { AccountConfig } from "@vingroto/core/config/schema"

import { AccountId } from "@vingroto/core/ids"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"

import type { Credential } from "@/lib/credential/service"
import type { OAuthShape } from "@/lib/oauth"

import { passwordReference } from "@/lib/credential/refs"
import { CredentialNotFound } from "@/lib/credential/service"
import {
  accountSecret,
  imapAuthFor,
  oauthActionFailure,
  oauthSyncFailure,
  smtpAuthFor,
} from "@/lib/mail/auth"
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

const makeCredential = (secrets: ReadonlyMap<string, string>): Credential["Service"] => ({
  get: (reference) => {
    const secret = secrets.get(reference)
    return secret === undefined
      ? Effect.fail(new CredentialNotFound({ reference, message: "no credentials stored" }))
      : Effect.succeed(secret)
  },
  set: () => Effect.void,
})

const oauthProvider = (accessToken: OAuthShape["accessToken"]): OAuthShape => ({
  accessToken,
  authorize: () => Effect.die("unused in this test"),
})

describe("account secret selection", () => {
  test("an oauth account takes its secret from the access token provider", async () => {
    const credential = makeCredential(new Map())
    const oauth = oauthProvider(() => Effect.succeed("at-1"))
    const secret = await Effect.runPromise(accountSecret({ credential, oauth }, oauthAccount))
    expect(secret).toBe("at-1")
  })

  test("a password account takes its secret from the keyring", async () => {
    const credential = makeCredential(new Map([[passwordReference(alpha), "app-password"]]))
    const secret = await Effect.runPromise(
      accountSecret(
        { credential, oauth: oauthProvider(() => Effect.die("unused")) },
        passwordAccount,
      ),
    )
    expect(secret).toBe("app-password")
  })

  test("a revoked grant propagates from the access token provider", async () => {
    const credential = makeCredential(new Map())
    const oauth = oauthProvider(() =>
      Effect.fail(new OAuthReauthorizationRequired({ message: "the grant was revoked" })),
    )
    const error = await Effect.runPromise(
      Effect.flip(accountSecret({ credential, oauth }, oauthAccount)),
    )
    expect(error._tag).toBe("OAuthReauthorizationRequired")
  })
})

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
