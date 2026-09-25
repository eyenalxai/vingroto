import type { AccountConfig } from "@vingroto/core/config/schema"
import type { Mailbox, MailboxCounts } from "@vingroto/core/protocol/mail"

import { AccountId, MailboxId, Uid } from "@vingroto/core/ids"
import { describe, expect, test } from "bun:test"

import { buildMailboxTreeRows } from "@/lib/mail/mailbox-tree"

const alpha = AccountId.make("alpha@example.com")
const beta = AccountId.make("beta@example.com")

const account = (id: AccountId, label: string): AccountConfig => {
  return {
    id,
    label,
    email: id,
    saveSent: true,
    imap: { host: "127.0.0.1", port: 993, security: "tls" },
    smtp: { host: "127.0.0.1", port: 465, security: "tls" },
  }
}

const mailbox = (
  id: number,
  accountId: AccountId,
  name: string,
  mailboxPath: string,
  muted: boolean,
): Mailbox => {
  return {
    id: MailboxId.make(id),
    accountId,
    path: mailboxPath,
    name,
    delimiter: "/",
    specialUse: null,
    selectable: true,
    muted,
    uidValidity: null,
    lastSeenUid: Uid.make(0),
    syncedAt: null,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe("buildMailboxTreeRows unread counts", () => {
  test("account rows use the distinct unread instead of the per-mailbox sum", () => {
    const inboxA = MailboxId.make(1)
    const allMailA = MailboxId.make(2)
    const inboxB = MailboxId.make(3)
    const counts: ReadonlyMap<MailboxId, MailboxCounts> = new Map([
      [inboxA, { total: 3, unread: 3 }],
      [allMailA, { total: 6, unread: 2 }],
      [inboxB, { total: 1, unread: 1 }],
    ])
    const rows = buildMailboxTreeRows({
      accounts: [account(alpha, "Account A"), account(beta, "Account B")],
      accountUnread: new Map([
        [alpha, 4],
        [beta, 1],
      ]),
      mailboxes: [
        mailbox(1, alpha, "INBOX", "INBOX", false),
        mailbox(2, alpha, "All Mail", "[Gmail]/All Mail", false),
        mailbox(3, beta, "INBOX", "INBOX", false),
      ],
      counts,
      unread: 5,
      outboxCount: 2,
      draftCount: 1,
      collapsed: new Set(),
    })
    const row = (key: string) => rows.find((entry) => entry.key === key)
    expect(row(`account:${alpha}`)?.count).toBe(4)
    expect(row(`virtual:unread:${alpha}`)?.count).toBe(4)
    expect(row(`account:${beta}`)?.count).toBe(1)
    expect(row("mailbox:1")?.count).toBe(3)
    expect(row("mailbox:2")?.count).toBe(2)
    expect(row("virtual:unread")?.count).toBe(5)
    expect(rows.map((entry) => entry.key).slice(0, 4)).toEqual([
      "virtual:all",
      "virtual:unread",
      "virtual:outbox",
      "virtual:drafts",
    ])
    expect(row("virtual:outbox")?.count).toBe(2)
    expect(row("virtual:drafts")?.count).toBe(1)
    const perMailboxSum = (row("mailbox:1")?.count ?? 0) + (row("mailbox:2")?.count ?? 0)
    expect(perMailboxSum).toBe(5)
    expect(perMailboxSum).not.toBe(row(`account:${alpha}`)?.count)
  })
})
