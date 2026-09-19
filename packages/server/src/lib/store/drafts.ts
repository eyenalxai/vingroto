import type { DraftId } from "@vingroto/core/ids"
import type { Draft, DraftSave } from "@vingroto/core/protocol/outgoing"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

import { desc, eq } from "drizzle-orm"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"

import { Database } from "@/lib/db/database"
import { DraftTable } from "@/lib/db/schema"

type DraftRow = typeof DraftTable.$inferSelect

const toDraft = (row: DraftRow): Draft => {
  return {
    id: row.id,
    accountId: row.account_id,
    to: row.to,
    cc: row.cc,
    bcc: row.bcc,
    subject: row.subject,
    body: row.body,
    inReplyTo: row.in_reply_to,
    references: row.references,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const toDraftValues = (input: DraftSave) => {
  return {
    account_id: input.accountId,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    body: input.body,
    in_reply_to: input.inReplyTo ?? null,
    references: input.references,
  }
}

const requireRow = <A>(rows: readonly A[]): Effect.Effect<A> =>
  rows[0] === undefined
    ? Effect.die(new Error("the database returned no row"))
    : Effect.succeed(rows[0])

const saveDraft = Effect.fn("Draft.save")(function* save(
  input: DraftSave,
): Effect.fn.Return<Draft, EffectDrizzleQueryError, Database> {
  const database = yield* Database
  const now = yield* Clock.currentTimeMillis
  const draftId = input.draftId
  const rows =
    draftId === undefined
      ? yield* database.client
          .insert(DraftTable)
          .values({ ...toDraftValues(input), updated_at: now })
          .returning()
      : yield* database.client
          .insert(DraftTable)
          .values({ id: draftId, ...toDraftValues(input), updated_at: now })
          .onConflictDoUpdate({
            target: DraftTable.id,
            set: { ...toDraftValues(input), updated_at: now },
          })
          .returning()
  return toDraft(yield* requireRow(rows))
})

const listDrafts = Effect.fn("Draft.list")(function* list(): Effect.fn.Return<
  readonly Draft[],
  EffectDrizzleQueryError,
  Database
> {
  const database = yield* Database
  const rows = yield* database.client
    .select()
    .from(DraftTable)
    .orderBy(desc(DraftTable.updated_at), desc(DraftTable.id))
  return rows.map((row) => toDraft(row))
})

const deleteDraft = Effect.fn("Draft.delete")(function* remove(
  draftId: DraftId,
): Effect.fn.Return<boolean, EffectDrizzleQueryError, Database> {
  const database = yield* Database
  const rows = yield* database.client
    .delete(DraftTable)
    .where(eq(DraftTable.id, draftId))
    .returning({ id: DraftTable.id })
  return rows.length > 0
})

export { deleteDraft, listDrafts, saveDraft }
