import { describe, expect, test } from "bun:test"

import type { AccountDraft } from "@/components/setup/form-model"

import {
  authForDraft,
  authLabel,
  credentialFields,
  cycleAuth,
  isGmailAddress,
} from "@/components/setup/credential-fields"
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

  test("non-gmail credential fields are unchanged", () => {
    expect(credentialFields(baseDraft({ email: "user@example.com" }))).toStrictEqual([
      { id: "email", label: "Email", kind: "text", placeholder: "you@example.com" },
      { id: "password", label: "Password", kind: "secret" },
    ])
  })

  test("only the gmail and googlemail domains expose the oauth choice", () => {
    for (const email of [
      "user@gmail.com",
      "User@GMAIL.com",
      "user@googlemail.com",
      "USER@GoogleMail.COM",
    ]) {
      expect(isGmailAddress(email)).toBe(true)
      expect(fieldIds(baseDraft({ email }))).toEqual(["email", "auth", "password"])
    }
    for (const email of ["user@example.com", "user@notgmail.com", "user@gmail.com.evil.com", ""]) {
      expect(isGmailAddress(email)).toBe(false)
      expect(fieldIds(baseDraft({ email }))).toEqual(["email", "password"])
    }
  })

  test("gmail oauth mode swaps the password for the client credentials", () => {
    expect(fieldIds(baseDraft({ email: "user@gmail.com", auth: "oauth2" }))).toEqual([
      "email",
      "auth",
      "oauthClientId",
      "oauthClientSecret",
    ])
  })

  test("gmail oauth mode requires a client id and drops the password", () => {
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

  test("gmail oauth mode passes the optional client secret to the authorization", () => {
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

  test("gmail password mode still requires the password and ignores oauth leftovers", () => {
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

  test("a stale oauth choice on a non-gmail address stays a password account", () => {
    const stale = baseDraft({
      email: "user@example.com",
      auth: "oauth2",
      oauthClientId: "client-123",
    })
    expect(authForDraft(stale)).toBe("password")
    const result = validateOk({ ...stale, password: "hunter2" })
    expect(result.value.auth).toBe("password")
    expect(result.value.oauth).toBeUndefined()
    expect(result.value.password).toBe("hunter2")
  })

  test("the auth choice cycles between Password and Google OAuth", () => {
    expect(authLabel("password")).toBe("Password")
    expect(authLabel("oauth2")).toBe("Google OAuth")
    expect(cycleAuth("password", 1)).toBe("oauth2")
    expect(cycleAuth("oauth2", 1)).toBe("password")
    expect(cycleAuth("password", -1)).toBe("oauth2")
  })
})
