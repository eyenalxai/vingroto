import { describe, expect, test } from "bun:test"

import type { AccountDraft } from "@/components/setup/form-model"

import { authLabel, credentialFields, cycleAuth } from "@/components/setup/credential-fields"
import { emptyDraft, validateDraft } from "@/components/setup/form-model"

const baseDraft = (overrides: Partial<AccountDraft> = {}): AccountDraft => ({
  ...emptyDraft(),
  imapHost: "imap.example.com",
  imapPort: "993",
  smtpHost: "smtp.example.com",
  smtpPort: "465",
  ...overrides,
})

const fieldIds = (draft: AccountDraft) => credentialFields(draft).map((field) => field.id)

const validateOk = (draft: AccountDraft) => {
  const result = validateDraft(draft)
  if (result._tag === "error") {
    throw new Error(`expected a valid draft, got: ${result.message}`)
  }
  return result
}

const servers = {
  imap: { host: "imap.example.com", port: 993, security: "tls" },
  smtp: { host: "smtp.example.com", port: 465, security: "tls" },
} as const

describe("account setup form model", () => {
  test("password mode validates and maps with the password auth method", () => {
    const missing = validateDraft(baseDraft({ email: "user@example.com" }))
    expect(missing._tag).toBe("error")
    if (missing._tag === "error") {
      expect(missing.message).toBe("enter the account password")
    }

    const result = validateOk(baseDraft({ email: "user@example.com", password: "hunter2" }))
    expect(result.value).toStrictEqual({
      email: "user@example.com",
      auth: "password",
      password: "hunter2",
      label: "user@example.com",
      username: "user@example.com",
      ...servers,
      saveSent: true,
    })
    expect(result.authorization).toBeUndefined()
  })

  test("every address exposes the authentication choice", () => {
    for (const email of [
      "user@gmail.com",
      "User@GMAIL.com",
      "user@googlemail.com",
      "USER@GoogleMail.COM",
      "user@example.com",
      "user@workspace.example",
    ]) {
      expect(fieldIds(baseDraft({ email }))).toEqual(["email", "auth", "password"])
    }
  })

  test("oauth mode swaps the password for the client credentials on any address", () => {
    for (const email of ["user@gmail.com", "user@example.com"]) {
      expect(fieldIds(baseDraft({ email, auth: "oauth2" }))).toEqual([
        "email",
        "auth",
        "oauthClientId",
        "oauthClientSecret",
      ])
    }
  })

  test("oauth mode requires a client id and drops the password", () => {
    const missing = validateDraft(baseDraft({ email: "user@gmail.com", auth: "oauth2" }))
    expect(missing._tag).toBe("error")
    if (missing._tag === "error") {
      expect(missing.message).toBe("enter the OAuth client ID")
    }

    const result = validateOk(
      baseDraft({ email: "user@gmail.com", auth: "oauth2", oauthClientId: "client-123" }),
    )
    expect(result.value).toStrictEqual({
      email: "user@gmail.com",
      auth: "oauth2",
      oauth: { provider: "gmail", clientId: "client-123" },
      label: "user@gmail.com",
      username: "user@gmail.com",
      ...servers,
      saveSent: true,
    })
    expect(result.authorization).toStrictEqual({ email: "user@gmail.com", clientId: "client-123" })
  })

  test("oauth mode passes the optional client secret to the authorization", () => {
    const result = validateOk(
      baseDraft({
        email: "user@gmail.com",
        auth: "oauth2",
        oauthClientId: "client-123",
        oauthClientSecret: "shh",
      }),
    )
    expect(result.authorization).toStrictEqual({
      email: "user@gmail.com",
      clientId: "client-123",
      clientSecret: "shh",
    })
  })

  test("password mode still requires the password and ignores oauth leftovers", () => {
    const missing = validateDraft(baseDraft({ email: "user@gmail.com", oauthClientId: "leftover" }))
    expect(missing._tag).toBe("error")
    if (missing._tag === "error") {
      expect(missing.message).toBe("enter the account password")
    }

    const result = validateOk(
      baseDraft({ email: "user@gmail.com", password: "hunter2", oauthClientId: "leftover" }),
    )
    expect(result.value.password).toBe("hunter2")
    expect(result.value.auth).toBe("password")
    expect(result.value.oauth).toBeUndefined()
    expect(result.authorization).toBeUndefined()
  })

  test("an oauth choice on a non-gmail address creates an oauth account", () => {
    const result = validateOk(
      baseDraft({
        email: "user@workspace.example",
        auth: "oauth2",
        oauthClientId: "client-123",
      }),
    )
    expect(result.value.auth).toBe("oauth2")
    expect(result.value.oauth).toStrictEqual({ provider: "gmail", clientId: "client-123" })
    expect(result.authorization).toStrictEqual({
      email: "user@workspace.example",
      clientId: "client-123",
    })
  })

  test("the auth choice cycles between Password and Google OAuth", () => {
    expect(authLabel("password")).toBe("Password")
    expect(authLabel("oauth2")).toBe("Google OAuth")
    expect(cycleAuth("password", 1)).toBe("oauth2")
    expect(cycleAuth("oauth2", 1)).toBe("password")
    expect(cycleAuth("password", -1)).toBe("oauth2")
  })
})
