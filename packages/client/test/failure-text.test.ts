import type { ActionFailure, SyncFailure } from "@vingroto/core/protocol/mail"

import { AccountId } from "@vingroto/core/ids"
import { describe, expect, test } from "bun:test"

import { formatActionFailure, formatSyncFailure } from "@/lib/mail/failure-text"

const alpha = AccountId.make("alpha@example.com")
const expiredMessage = "the Google authorization expired or was revoked; re-authorize the account"

describe("oauth failure text", () => {
  test("an expired action failure points at re-authorization", () => {
    const failure: ActionFailure = {
      _tag: "oauth",
      accountId: alpha,
      mailboxPath: "INBOX",
      message: expiredMessage,
      reauthorizationRequired: true,
    }
    expect(formatActionFailure(failure)).toBe(
      `account ${alpha} mailbox INBOX: authorization expired · re-authorize in settings`,
    )
  })

  test("another oauth action failure keeps its message", () => {
    const failure: ActionFailure = {
      _tag: "oauth",
      accountId: alpha,
      mailboxPath: "INBOX",
      message: "Google rejected the token refresh",
      reauthorizationRequired: false,
    }
    expect(formatActionFailure(failure)).toBe(
      `account ${alpha} mailbox INBOX: Google rejected the token refresh`,
    )
  })

  test("an expired sync failure points at re-authorization", () => {
    const failure: SyncFailure = {
      _tag: "oauth",
      accountId: alpha,
      message: expiredMessage,
      reauthorizationRequired: true,
    }
    expect(formatSyncFailure(failure)).toBe("authorization expired · re-authorize in settings")
  })

  test("another oauth sync failure keeps its message", () => {
    const failure: SyncFailure = {
      _tag: "oauth",
      accountId: alpha,
      message: "Google rejected the token refresh",
      reauthorizationRequired: false,
    }
    expect(formatSyncFailure(failure)).toBe("Google rejected the token refresh")
  })
})
