import type { AccountConfig } from "@vingroto/core/config/schema"

import { AccountId } from "@vingroto/core/ids"
import { describe, expect, test } from "bun:test"

import type { AccountRowsPort } from "@/components/settings/settings-rows"
import type { AccountDraft } from "@/components/setup/form-model"

import { draftFromAccount, draftsMatch } from "@/components/settings/account-draft"
import { accountRows } from "@/components/settings/settings-rows"
import { validateEditDraft } from "@/components/setup/form-model"

const passwordAccount: AccountConfig = {
  id: AccountId.make("user@example.com"),
  label: "Personal",
  email: "user@example.com",
  auth: "password",
  saveSent: true,
  imap: { host: "imap.example.com", port: 993, security: "tls" },
  smtp: { host: "smtp.example.com", port: 465, security: "tls" },
}

const oauthAccount: AccountConfig = {
  id: AccountId.make("user@gmail.com"),
  label: "Gmail",
  email: "user@gmail.com",
  auth: "oauth2",
  oauth: { provider: "gmail", clientId: "client-123" },
  saveSent: true,
  imap: { host: "imap.gmail.com", port: 993, security: "tls" },
  smtp: { host: "smtp.gmail.com", port: 465, security: "tls" },
}

const noop = () => void 0

const rowsPort = (overrides: Partial<AccountRowsPort> = {}): AccountRowsPort => ({
  applyKey: () => false,
  cycle: noop,
  input: noop,
  loading: () => false,
  reauthorize: noop,
  restorePassword: noop,
  save: noop,
  value: () => "",
  ...overrides,
})

const editOk = (draft: AccountDraft) => {
  const result = validateEditDraft(draft)
  if (result._tag === "error") {
    throw new Error(`expected a valid edit, got: ${result.message}`)
  }
  return result.value
}

describe("account settings draft", () => {
  test("an oauth account's draft carries its auth method and client id", () => {
    const draft = draftFromAccount(oauthAccount)
    expect(draft.auth).toBe("oauth2")
    expect(draft.oauthClientId).toBe("client-123")
    expect(draft.password).toBe("")
    expect(draftsMatch(draft, draftFromAccount(oauthAccount))).toBe(true)
    expect(draftsMatch({ ...draft, auth: "password" }, draft)).toBe(false)
    expect(draftsMatch({ ...draft, oauthClientId: "other" }, draft)).toBe(false)
  })

  test("a password account's draft stays a password draft", () => {
    const draft = draftFromAccount(passwordAccount, "stored-user")
    expect(draft.auth).toBe("password")
    expect(draft.oauthClientId).toBe("")
    expect(draft.username).toBe("stored-user")
  })
})

describe("account settings edit validation", () => {
  test("an oauth edit preserves auth and oauth and never sends a password", () => {
    expect(editOk(draftFromAccount(oauthAccount))).toStrictEqual({
      label: "Gmail",
      username: "user@gmail.com",
      imap: { host: "imap.gmail.com", port: 993, security: "tls" },
      smtp: { host: "smtp.gmail.com", port: 465, security: "tls" },
      saveSent: true,
      auth: "oauth2",
      oauth: { provider: "gmail", clientId: "client-123" },
    })
  })

  test("a password edit carries the password auth method and the changed password", () => {
    const draft = { ...draftFromAccount(passwordAccount), password: "hunter2" }
    expect(editOk(draft)).toStrictEqual({
      label: "Personal",
      username: "user@example.com",
      imap: { host: "imap.example.com", port: 993, security: "tls" },
      smtp: { host: "smtp.example.com", port: 465, security: "tls" },
      saveSent: true,
      auth: "password",
      password: "hunter2",
    })
  })

  test("an oauth edit without a client id is rejected", () => {
    const result = validateEditDraft({
      ...draftFromAccount(oauthAccount),
      oauthClientId: "",
    })
    expect(result._tag).toBe("error")
    if (result._tag === "error") {
      expect(result.message).toBe("enter the OAuth client ID")
    }
  })
})

describe("account settings rows", () => {
  test("an oauth account shows the auth method and a re-authorize action", () => {
    let reauthorized = false
    const rows = accountRows(
      oauthAccount,
      rowsPort({
        value: (field) => (field === "auth" ? "oauth2" : ""),
        reauthorize: () => {
          reauthorized = true
        },
      }),
    )
    const keys = rows.map((row) => row.key)
    expect(keys).toContain("account:user@gmail.com:auth")
    expect(keys).not.toContain("account:user@gmail.com:password")
    expect(keys).toContain("account:user@gmail.com:reauthorize")
    const authentication = rows.find((row) => row.key === "account:user@gmail.com:auth")
    expect(authentication?.kind).toBe("reading")
    if (authentication?.kind === "reading") {
      expect(authentication.label).toBe("Authentication")
      expect(authentication.value()).toBe("Google OAuth")
    }
    const action = rows.find((row) => row.key === "account:user@gmail.com:reauthorize")
    expect(action?.kind).toBe("action")
    if (action?.kind === "action") {
      action.run()
    }
    expect(reauthorized).toBe(true)
  })

  test("a password account keeps its password row and has no re-authorize action", () => {
    const rows = accountRows(passwordAccount, rowsPort())
    const keys = rows.map((row) => row.key)
    expect(keys).toContain("account:user@example.com:password")
    expect(keys).not.toContain("account:user@example.com:auth")
    expect(keys).not.toContain("account:user@example.com:reauthorize")
    const password = rows.find((row) => row.key === "account:user@example.com:password")
    expect(password?.kind).toBe("secret")
  })
})
