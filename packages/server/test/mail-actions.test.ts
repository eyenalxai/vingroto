import type { Uid } from "@vingroto/core/ids"

import { AccountId, MessageId } from "@vingroto/core/ids"
import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"

import type { FlagMode } from "@/lib/mail/imap-types"

import { Database } from "@/lib/db/database"
import { MailboxTable, MessageTable } from "@/lib/db/schema"
import { ServerEvents } from "@/lib/events"
import { MailActions } from "@/lib/mail/actions"
import { Imap } from "@/lib/mail/imap"
import { readMailboxSnapshot } from "@/lib/mailboxes"
import {
  listEmailActionTargets,
  listMessageActionTargets,
} from "@/lib/store/message-action-targets"
import { listMessagesForScope } from "@/lib/store/message-views"

import type { Fixture } from "./helpers/fixture"

import {
  accountConfig,
  makeFixture,
  seedMailboxes,
  seedMessages,
  writeConfig,
} from "./helpers/fixture"

interface StoreCall {
  readonly account: AccountId
  readonly mailboxPath: string
  readonly uids: readonly Uid[]
  readonly flags: readonly string[]
  readonly mode: FlagMode
}

interface Harness {
  readonly calls: StoreCall[]
  readonly cleanup: () => Promise<void>
  readonly fixture: Fixture
  readonly run: <A, E>(program: Effect.Effect<A, E, MailActions | Database>) => Promise<A>
}

const alpha = AccountId.make("alpha@example.com")
const beta = AccountId.make("beta@example.com")

const callKeys = (calls: readonly StoreCall[]): string[] =>
  calls
    .map((call) => `${call.account}:${call.mailboxPath}:${call.uids.join(",")}:${call.mode}`)
    .toSorted()

const recordStores = (calls: StoreCall[]): Layer.Layer<Imap> =>
  Layer.succeed(
    Imap,
    Imap.of({
      appendMessage: () => Effect.die("appendMessage must not be called"),
      fetchEnvelopes: () => Effect.die("fetchEnvelopes must not be called"),
      fetchMailboxWindows: () => Stream.empty,
      fetchMessageSource: () => Effect.succeed(Buffer.alloc(0)),
      fetchMessageSources: () => Stream.empty,
      listMailboxes: () => Effect.succeed([]),
      moveMessages: () => Effect.die("moveMessages must not be called"),
      searchMessages: () => Effect.die("searchMessages must not be called"),
      setFlags: (account, mailboxPath, uids, flags, mode) =>
        Effect.sync(() => {
          calls.push({ account: account.id, mailboxPath, uids: [...uids], flags: [...flags], mode })
        }),
    }),
  )

const makeHarness = async (): Promise<Harness> => {
  const fixture = await makeFixture()
  const calls: StoreCall[] = []
  const services = Layer.mergeAll(fixture.layers, recordStores(calls), ServerEvents.layer)
  const layers = Layer.merge(services, MailActions.layer.pipe(Layer.provide(services)))
  return {
    calls,
    cleanup: fixture.cleanup,
    fixture,
    run: async (program) => {
      const result = await Effect.runPromise(Effect.provide(program, layers))
      return result
    },
  }
}

const withHarness = async <A>(use: (harness: Harness) => Promise<A>): Promise<A> => {
  const harness = await makeHarness()
  try {
    return await use(harness)
  } finally {
    await harness.cleanup()
  }
}

const seenState = (messageId: string) =>
  Effect.gen(function* readSeenState() {
    const database = yield* Database
    const rows = yield* database.client
      .select({
        accountId: MessageTable.account_id,
        mailboxPath: MailboxTable.path,
        uid: MessageTable.uid,
        seen: MessageTable.seen,
      })
      .from(MessageTable)
      .innerJoin(MailboxTable, eq(MessageTable.mailbox_id, MailboxTable.id))
      .where(eq(MessageTable.message_id, messageId))
    return rows
      .map(
        (row) => `${row.accountId}:${row.mailboxPath}:${row.uid}:${row.seen ? "read" : "unread"}`,
      )
      .toSorted()
  })

describe("MailActions.setSeenByIds", () => {
  test("reads every copy in the account and leaves other accounts alone", async () => {
    await withHarness(async (harness) => {
      await writeConfig(harness.fixture, [
        accountConfig(alpha, "Alpha"),
        accountConfig(beta, "Beta"),
      ])
      const outcome = await harness.run(
        Effect.gen(function* readCopies() {
          const mailboxes = yield* seedMailboxes([
            { account: alpha, path: "INBOX", specialUse: String.raw`\Inbox` },
            { account: alpha, path: "[Gmail]/All Mail", specialUse: String.raw`\All` },
            { account: alpha, path: "[Gmail]/Important" },
            { account: alpha, path: "Archive" },
            { account: beta, path: "INBOX", specialUse: String.raw`\Inbox` },
          ])
          const messages = yield* seedMessages(mailboxes, [
            { account: alpha, path: "INBOX", uid: 10, messageId: "<x@x>" },
            { account: alpha, path: "[Gmail]/All Mail", uid: 11, messageId: "<x@x>" },
            { account: alpha, path: "[Gmail]/Important", uid: 12, messageId: "<x@x>" },
            { account: alpha, path: "Archive", uid: 13, messageId: "<x@x>" },
            { account: beta, path: "INBOX", uid: 20, messageId: "<x@x>" },
            { account: alpha, path: "INBOX", uid: 14, messageId: null },
            { account: alpha, path: "INBOX", uid: 15, messageId: "<z@x>" },
            { account: alpha, path: "Archive", uid: 16, messageId: "<z@x>" },
          ])
          const actions = yield* MailActions
          const xInbox = messages.id(alpha, "INBOX", 10)
          const copies = yield* listEmailActionTargets([xInbox])
          const requestTargets = yield* listMessageActionTargets([xInbox])
          const read = yield* actions.setSeenByIds([xInbox], true)
          return {
            copies: copies.copies.length,
            read,
            requestCount: requestTargets.length,
            requested: copies.requested.length,
            snapshot: yield* readMailboxSnapshot(),
            state: yield* seenState("<x@x>"),
            unread: yield* listMessagesForScope({ kind: "unread" }, 100),
          }
        }),
      )
      expect(outcome.read).toEqual({ affected: 1, errors: [] })
      expect(outcome.requestCount).toBe(1)
      expect(outcome.copies).toBe(4)
      expect(outcome.requested).toBe(1)
      expect(callKeys(harness.calls)).toEqual(
        [
          `${alpha}:INBOX:10:add`,
          `${alpha}:[Gmail]/All Mail:11:add`,
          `${alpha}:[Gmail]/Important:12:add`,
          `${alpha}:Archive:13:add`,
        ].toSorted(),
      )
      expect(
        harness.calls.every(
          (call) => call.flags.length === 1 && call.flags[0] === String.raw`\Seen`,
        ),
      ).toBe(true)
      expect(outcome.state).toEqual(
        [
          `${alpha}:INBOX:10:read`,
          `${alpha}:[Gmail]/All Mail:11:read`,
          `${alpha}:[Gmail]/Important:12:read`,
          `${alpha}:Archive:13:read`,
          `${beta}:INBOX:20:unread`,
        ].toSorted(),
      )
      expect(
        outcome.unread
          .filter((row) => row.accountId === alpha)
          .map((row) => Number(row.uid))
          .toSorted((left, right) => left - right),
      ).toEqual([14, 15])
      expect(
        outcome.snapshot.accountUnread
          .map((entry) => `${entry.accountId}|${entry.unread}`)
          .toSorted(),
      ).toEqual([`${alpha}|2`, `${beta}|1`])
    })
  })

  test("unread removes the flag, NULL Message-IDs stay single and missing ids error", async () => {
    await withHarness(async (harness) => {
      await writeConfig(harness.fixture, [
        accountConfig(alpha, "Alpha"),
        accountConfig(beta, "Beta"),
      ])
      const outcome = await harness.run(
        Effect.gen(function* toggleSeen() {
          const mailboxes = yield* seedMailboxes([
            { account: alpha, path: "INBOX", specialUse: String.raw`\Inbox` },
            { account: alpha, path: "[Gmail]/All Mail", specialUse: String.raw`\All` },
            { account: alpha, path: "Archive" },
            { account: beta, path: "INBOX", specialUse: String.raw`\Inbox` },
          ])
          const messages = yield* seedMessages(mailboxes, [
            { account: alpha, path: "INBOX", uid: 10, messageId: "<x@x>", seen: true },
            { account: alpha, path: "[Gmail]/All Mail", uid: 11, messageId: "<x@x>", seen: true },
            { account: alpha, path: "Archive", uid: 12, messageId: "<x@x>", seen: true },
            { account: beta, path: "INBOX", uid: 20, messageId: "<x@x>", seen: true },
            { account: alpha, path: "INBOX", uid: 14, messageId: null },
          ])
          const actions = yield* MailActions
          const xInbox = messages.id(alpha, "INBOX", 10)
          const unread = yield* actions.setSeenByIds([xInbox], false)
          const unreadCalls = [...harness.calls]
          harness.calls.length = 0
          const nullInbox = messages.id(alpha, "INBOX", 14)
          const readNull = yield* actions.setSeenByIds([nullInbox], true)
          const nullCalls = [...harness.calls]
          harness.calls.length = 0
          const missing = yield* actions.setSeenByIds([MessageId.make(999_999)], true)
          return {
            missing,
            missingCalls: [...harness.calls],
            nullCalls,
            readNull,
            unread,
            unreadCalls,
            unreadState: yield* seenState("<x@x>"),
          }
        }),
      )
      expect(outcome.unread).toEqual({ affected: 1, errors: [] })
      expect(callKeys(outcome.unreadCalls)).toEqual(
        [
          `${alpha}:INBOX:10:remove`,
          `${alpha}:[Gmail]/All Mail:11:remove`,
          `${alpha}:Archive:12:remove`,
        ].toSorted(),
      )
      expect(outcome.unreadState).toEqual(
        [
          `${alpha}:INBOX:10:unread`,
          `${alpha}:[Gmail]/All Mail:11:unread`,
          `${alpha}:Archive:12:unread`,
          `${beta}:INBOX:20:read`,
        ].toSorted(),
      )
      expect(outcome.readNull).toEqual({ affected: 1, errors: [] })
      expect(callKeys(outcome.nullCalls)).toEqual([`${alpha}:INBOX:14:add`])
      expect(outcome.missing.affected).toBe(0)
      expect(outcome.missing.errors).toEqual([{ _tag: "messages-not-found", count: 1 }])
      expect(outcome.missingCalls).toEqual([])
    })
  })
})
