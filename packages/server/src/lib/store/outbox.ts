import type { AccountId, DraftId, OutboxId } from "@vingroto/core/ids"
import type { MailAddress } from "@vingroto/core/mail/address"
import type { OutboxEntry } from "@vingroto/core/protocol/outgoing"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import type { SqlError } from "effect/unstable/sql/SqlError"

import { and, asc, eq, lte } from "drizzle-orm"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"

import {
  decodeStored,
  persistedOutboxState,
  persistedRequiredAddressList,
  persistedRequiredReferenceList,
} from "@/lib/db/codecs"
import { Database } from "@/lib/db/database"
import { DraftTable, OutboxTable } from "@/lib/db/schema"

type OutboxStoreError = EffectDrizzleQueryError | SqlError

type OutboxRow = typeof OutboxTable.$inferSelect

interface OutboxWrite {
  readonly accountId: AccountId
  readonly to: readonly MailAddress[]
  readonly cc: readonly MailAddress[]
  readonly bcc: readonly MailAddress[]
  readonly subject: string
  readonly body: string
  readonly inReplyTo: string | null
  readonly references: readonly string[]
  readonly sendAt: number
}

interface OutboxAttempt {
  readonly id: OutboxId
  readonly attempts: number
  readonly sendAt: number
  readonly state: "pending" | "failed"
  readonly lastError: string
}

const toOutboxEntry = Effect.fnUntraced(function* toEntry(row: OutboxRow) {
  const [to, cc, bcc, references, state] = yield* Effect.all([
    decodeStored(persistedRequiredAddressList, row.to),
    decodeStored(persistedRequiredAddressList, row.cc),
    decodeStored(persistedRequiredAddressList, row.bcc),
    decodeStored(persistedRequiredReferenceList, row.references),
    decodeStored(persistedOutboxState, row.state),
  ])
  return {
    id: row.id,
    accountId: row.account_id,
    to,
    cc,
    bcc,
    subject: row.subject,
    body: row.body,
    inReplyTo: row.in_reply_to,
    references,
    createdAt: row.created_at,
    sendAt: row.send_at,
    attempts: row.attempts,
    state,
    lastError: row.last_error,
  }
})

const requireRow = <A>(rows: readonly A[]): Effect.Effect<A> =>
  rows[0] === undefined
    ? Effect.die(new Error("the database returned no row"))
    : Effect.succeed(rows[0])

const insertOutboxEntry = Effect.fn("Outbox.insert")(function* insert(
  input: OutboxWrite,
  draftId: DraftId | undefined,
): Effect.fn.Return<OutboxEntry, OutboxStoreError, Database> {
  const database = yield* Database
  const now = yield* Clock.currentTimeMillis
  return yield* database.client.transaction((tx) =>
    Effect.gen(function* insertEntry() {
      const rows = yield* tx
        .insert(OutboxTable)
        .values({
          account_id: input.accountId,
          to: input.to,
          cc: input.cc,
          bcc: input.bcc,
          subject: input.subject,
          body: input.body,
          in_reply_to: input.inReplyTo,
          references: input.references,
          send_at: input.sendAt,
          created_at: now,
          updated_at: now,
        })
        .returning()
      if (draftId !== undefined) {
        yield* tx.delete(DraftTable).where(eq(DraftTable.id, draftId))
      }
      return yield* toOutboxEntry(yield* requireRow(rows))
    }),
  )
})

const listOutboxEntries = Effect.fn("Outbox.list")(function* list(): Effect.fn.Return<
  readonly OutboxEntry[],
  EffectDrizzleQueryError,
  Database
> {
  const database = yield* Database
  const rows = yield* database.client
    .select()
    .from(OutboxTable)
    .orderBy(asc(OutboxTable.send_at), asc(OutboxTable.id))
  return yield* Effect.forEach(rows, (row) => toOutboxEntry(row))
})

const listDueOutboxEntries = Effect.fn("Outbox.listDue")(function* listDue(
  now: number,
): Effect.fn.Return<readonly OutboxEntry[], EffectDrizzleQueryError, Database> {
  const database = yield* Database
  const rows = yield* database.client
    .select()
    .from(OutboxTable)
    .where(and(eq(OutboxTable.state, "pending"), lte(OutboxTable.send_at, now)))
    .orderBy(asc(OutboxTable.send_at), asc(OutboxTable.id))
  return yield* Effect.forEach(rows, (row) => toOutboxEntry(row))
})

const getOutboxEntry = Effect.fn("Outbox.get")(function* get(
  outboxId: OutboxId,
): Effect.fn.Return<OutboxEntry | undefined, EffectDrizzleQueryError, Database> {
  const database = yield* Database
  const rows = yield* database.client
    .select()
    .from(OutboxTable)
    .where(eq(OutboxTable.id, outboxId))
    .limit(1)
  const row = rows[0]
  return row === undefined ? undefined : yield* toOutboxEntry(row)
})

const deleteOutboxEntry = Effect.fn("Outbox.delete")(function* remove(outboxId: OutboxId) {
  const database = yield* Database
  yield* database.client.delete(OutboxTable).where(eq(OutboxTable.id, outboxId))
})

const markOutboxAttempt = Effect.fn("Outbox.markAttempt")(function* mark(attempt: OutboxAttempt) {
  const database = yield* Database
  const now = yield* Clock.currentTimeMillis
  yield* database.client
    .update(OutboxTable)
    .set({
      attempts: attempt.attempts,
      send_at: attempt.sendAt,
      state: attempt.state,
      last_error: attempt.lastError,
      updated_at: now,
    })
    .where(eq(OutboxTable.id, attempt.id))
})

const releaseOutboxEntry = Effect.fn("Outbox.release")(function* release(
  outboxId: OutboxId,
  now: number,
): Effect.fn.Return<OutboxEntry | undefined, EffectDrizzleQueryError, Database> {
  const database = yield* Database
  const rows = yield* database.client
    .update(OutboxTable)
    .set({
      send_at: now,
      attempts: 0,
      state: "pending",
      last_error: null,
      updated_at: now,
    })
    .where(eq(OutboxTable.id, outboxId))
    .returning()
  const row = rows[0]
  return row === undefined ? undefined : yield* toOutboxEntry(row)
})

const cancelOutboxEntry = Effect.fn("Outbox.cancel")(function* cancel(
  outboxId: OutboxId,
): Effect.fn.Return<boolean, OutboxStoreError, Database> {
  const database = yield* Database
  const now = yield* Clock.currentTimeMillis
  return yield* database.client.transaction((tx) =>
    Effect.gen(function* moveToDraft() {
      const rows = yield* tx.select().from(OutboxTable).where(eq(OutboxTable.id, outboxId)).limit(1)
      const row = rows[0]
      if (row === undefined) {
        return false
      }
      yield* tx.insert(DraftTable).values({
        account_id: row.account_id,
        to: row.to,
        cc: row.cc,
        bcc: row.bcc,
        subject: row.subject,
        body: row.body,
        in_reply_to: row.in_reply_to,
        references: row.references,
        created_at: row.created_at,
        updated_at: now,
      })
      yield* tx.delete(OutboxTable).where(eq(OutboxTable.id, outboxId))
      return true
    }),
  )
})

export {
  cancelOutboxEntry,
  deleteOutboxEntry,
  getOutboxEntry,
  insertOutboxEntry,
  listDueOutboxEntries,
  listOutboxEntries,
  markOutboxAttempt,
  releaseOutboxEntry,
  type OutboxAttempt,
  type OutboxWrite,
}
