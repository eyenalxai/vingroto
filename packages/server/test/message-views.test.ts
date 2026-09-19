import { AccountId } from "@vingroto/core/ids"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"

import { readMailboxSnapshot } from "@/lib/mailboxes"
import { listMessagesForScope } from "@/lib/store/message-views"
import { listMessages, messageCounts } from "@/lib/store/messages"

import { mailboxId, seedMailboxes, seedMessages, withFixture } from "./helpers/fixture"

const alpha = AccountId.make("alpha@example.com")
const beta = AccountId.make("beta@example.com")

const all = { kind: "all" } as const

const keysOf = (
  rows: readonly { accountId: string; mailboxPath: string; uid: number }[],
): string[] => rows.map((row) => `${row.accountId}:${row.mailboxPath}:${row.uid}`).toSorted()

describe("virtual message views", () => {
  test("picks the Inbox copy over lower-id labels and All Mail", async () => {
    await withFixture(async (fixture) => {
      const rows = await fixture.run(
        Effect.gen(function* loadRows() {
          const mailboxes = yield* seedMailboxes([
            { account: alpha, path: "Labels/Work" },
            { account: alpha, path: "[Gmail]/All Mail", specialUse: String.raw`\All` },
            { account: alpha, path: "INBOX", specialUse: String.raw`\Inbox` },
          ])
          yield* seedMessages(mailboxes, [
            { account: alpha, path: "Labels/Work", uid: 5, messageId: "<k1@x>" },
            { account: alpha, path: "[Gmail]/All Mail", uid: 6, messageId: "<k1@x>" },
            { account: alpha, path: "INBOX", uid: 7, messageId: "<k1@x>" },
          ])
          return yield* listMessagesForScope(all, 100)
        }),
      )
      expect(keysOf(rows)).toEqual([`${alpha}:INBOX:7`])
    })
  })

  test("prefers unmuted mailboxes over All Mail and All Mail over muted ones", async () => {
    await withFixture(async (fixture) => {
      const outcome = await fixture.run(
        Effect.gen(function* loadOutcome() {
          const mailboxes = yield* seedMailboxes([
            { account: alpha, path: "[Gmail]/All Mail", specialUse: String.raw`\All` },
            { account: alpha, path: "Spam", specialUse: String.raw`\Junk`, muted: true },
            { account: alpha, path: "Labels/Work" },
          ])
          yield* seedMessages(mailboxes, [
            { account: alpha, path: "[Gmail]/All Mail", uid: 8, messageId: "<k1@x>" },
            { account: alpha, path: "Spam", uid: 9, messageId: "<k1@x>" },
            { account: alpha, path: "Labels/Work", uid: 12, messageId: "<k2@x>" },
            { account: alpha, path: "[Gmail]/All Mail", uid: 13, messageId: "<k2@x>" },
            { account: alpha, path: "Spam", uid: 14, messageId: "<k3@x>" },
          ])
          const visible = yield* listMessagesForScope(all, 100)
          const unread = yield* listMessagesForScope({ kind: "unread" }, 100)
          const counts = yield* messageCounts()
          return { counts, spam: mailboxId(mailboxes, alpha, "Spam"), unread, visible }
        }),
      )
      expect(keysOf(outcome.visible)).toEqual([
        `${alpha}:Labels/Work:12`,
        `${alpha}:Spam:14`,
        `${alpha}:[Gmail]/All Mail:8`,
      ])
      expect(keysOf(outcome.unread)).toEqual([
        `${alpha}:Labels/Work:12`,
        `${alpha}:[Gmail]/All Mail:8`,
      ])
      expect(outcome.counts.get(outcome.spam)).toEqual({ total: 2, unread: 2 })
    })
  })

  test("breaks ties on the lowest mailbox id and then the lowest uid", async () => {
    await withFixture(async (fixture) => {
      const rows = await fixture.run(
        Effect.gen(function* loadRows() {
          const mailboxes = yield* seedMailboxes([
            { account: alpha, path: "Labels/Zed" },
            { account: alpha, path: "Labels/Able" },
          ])
          yield* seedMessages(mailboxes, [
            { account: alpha, path: "Labels/Zed", uid: 30, messageId: "<k1@x>" },
            { account: alpha, path: "Labels/Able", uid: 20, messageId: "<k1@x>" },
            { account: alpha, path: "Labels/Zed", uid: 40, messageId: "<k2@x>" },
            { account: alpha, path: "Labels/Zed", uid: 41, messageId: "<k2@x>" },
          ])
          return yield* listMessagesForScope(all, 100)
        }),
      )
      expect(keysOf(rows)).toEqual([`${alpha}:Labels/Zed:30`, `${alpha}:Labels/Zed:40`])
    })
  })

  test("keeps the same Message-ID apart across accounts and NULL rows apart", async () => {
    await withFixture(async (fixture) => {
      const outcome = await fixture.run(
        Effect.gen(function* loadOutcome() {
          const mailboxes = yield* seedMailboxes([
            { account: alpha, path: "INBOX", specialUse: String.raw`\Inbox` },
            { account: beta, path: "INBOX", specialUse: String.raw`\Inbox` },
            { account: alpha, path: "[Gmail]/All Mail", specialUse: String.raw`\All` },
          ])
          yield* seedMessages(mailboxes, [
            { account: alpha, path: "INBOX", uid: 1, messageId: "<x@x>" },
            { account: beta, path: "INBOX", uid: 2, messageId: "<x@x>" },
            { account: alpha, path: "INBOX", uid: 3, messageId: null },
            { account: alpha, path: "[Gmail]/All Mail", uid: 4, messageId: null },
          ])
          const visible = yield* listMessagesForScope(all, 100)
          const scoped = yield* listMessagesForScope({ kind: "unread", accountId: alpha }, 100)
          return { scoped, visible }
        }),
      )
      expect(keysOf(outcome.visible)).toEqual([
        `${alpha}:INBOX:1`,
        `${alpha}:INBOX:3`,
        `${alpha}:[Gmail]/All Mail:4`,
        `${beta}:INBOX:2`,
      ])
      expect(keysOf(outcome.scoped)).toEqual([
        `${alpha}:INBOX:1`,
        `${alpha}:INBOX:3`,
        `${alpha}:[Gmail]/All Mail:4`,
      ])
    })
  })

  test("applies the limit after dedupe", async () => {
    await withFixture(async (fixture) => {
      const rows = await fixture.run(
        Effect.gen(function* loadRows() {
          const mailboxes = yield* seedMailboxes([
            { account: alpha, path: "INBOX", specialUse: String.raw`\Inbox` },
            { account: alpha, path: "[Gmail]/All Mail", specialUse: String.raw`\All` },
          ])
          yield* seedMessages(mailboxes, [
            {
              account: alpha,
              path: "[Gmail]/All Mail",
              uid: 2,
              messageId: "<x@x>",
              date: 1_700_000_002_000,
            },
            {
              account: alpha,
              path: "INBOX",
              uid: 1,
              messageId: "<x@x>",
              date: 1_700_000_001_000,
            },
            {
              account: alpha,
              path: "INBOX",
              uid: 3,
              messageId: "<y@x>",
              date: 1_700_000_000_000,
            },
          ])
          return yield* listMessagesForScope(all, 2)
        }),
      )
      expect(keysOf(rows)).toEqual([`${alpha}:INBOX:1`, `${alpha}:INBOX:3`])
    })
  })

  test("lists every mailbox copy while the view keeps one row per email", async () => {
    await withFixture(async (fixture) => {
      const outcome = await fixture.run(
        Effect.gen(function* loadOutcome() {
          const mailboxes = yield* seedMailboxes([
            { account: alpha, path: "INBOX", specialUse: String.raw`\Inbox` },
            { account: alpha, path: "[Gmail]/All Mail", specialUse: String.raw`\All` },
            { account: alpha, path: "Labels/Work" },
          ])
          yield* seedMessages(mailboxes, [
            { account: alpha, path: "INBOX", uid: 1, messageId: "<x@x>" },
            { account: alpha, path: "[Gmail]/All Mail", uid: 2, messageId: "<x@x>" },
            { account: alpha, path: "Labels/Work", uid: 3, messageId: "<x@x>" },
          ])
          const inbox = yield* listMessages(mailboxId(mailboxes, alpha, "INBOX"), 100)
          const work = yield* listMessages(mailboxId(mailboxes, alpha, "Labels/Work"), 100)
          const view = yield* listMessagesForScope(all, 100)
          return { inbox, view, work }
        }),
      )
      expect(keysOf(outcome.inbox)).toEqual([`${alpha}:INBOX:1`])
      expect(keysOf(outcome.work)).toEqual([`${alpha}:Labels/Work:3`])
      expect(keysOf(outcome.view)).toEqual([`${alpha}:INBOX:1`])
    })
  })

  test("counts distinct unread per account in the snapshot", async () => {
    await withFixture(async (fixture) => {
      const outcome = await fixture.run(
        Effect.gen(function* loadOutcome() {
          const mailboxes = yield* seedMailboxes([
            { account: alpha, path: "INBOX", specialUse: String.raw`\Inbox` },
            { account: alpha, path: "[Gmail]/All Mail", specialUse: String.raw`\All` },
            { account: alpha, path: "Spam", specialUse: String.raw`\Junk`, muted: true },
            { account: alpha, path: "Labels/Work" },
            { account: beta, path: "INBOX", specialUse: String.raw`\Inbox` },
          ])
          yield* seedMessages(mailboxes, [
            { account: alpha, path: "INBOX", uid: 10, messageId: "<x@x>" },
            { account: alpha, path: "[Gmail]/All Mail", uid: 11, messageId: "<x@x>" },
            { account: alpha, path: "INBOX", uid: 12, messageId: "<s@x>", seen: true },
            { account: alpha, path: "INBOX", uid: 13, messageId: null },
            { account: alpha, path: "Spam", uid: 14, messageId: "<m@x>" },
            { account: alpha, path: "Labels/Work", uid: 15, messageId: "<w@x>" },
            { account: beta, path: "INBOX", uid: 20, messageId: "<x@x>" },
          ])
          const counts = yield* messageCounts()
          const snapshot = yield* readMailboxSnapshot()
          return { counts, inbox: mailboxId(mailboxes, alpha, "INBOX"), snapshot }
        }),
      )
      expect(outcome.snapshot.unread).toBe(4)
      expect(
        outcome.snapshot.accountUnread
          .map((entry) => `${entry.accountId}|${entry.unread}`)
          .toSorted(),
      ).toEqual([`${alpha}|3`, `${beta}|1`])
      expect(outcome.counts.get(outcome.inbox)).toEqual({ total: 3, unread: 2 })
    })
  })
})
