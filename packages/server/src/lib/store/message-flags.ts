import type { MailboxId, Uid } from "@vingroto/core/ids"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

import { and, eq, inArray } from "drizzle-orm"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"

import type { MessageFlags } from "@/lib/mail/imap-types"

import { Database } from "@/lib/db/database"
import { MessageTable } from "@/lib/db/schema"

const listMessageUids = Effect.fn("Message.listUids")(function* listUids(
  mailboxId: MailboxId,
): Effect.fn.Return<readonly Uid[], EffectDrizzleQueryError, Database> {
  const database = yield* Database
  const rows = yield* database.client
    .select({ uid: MessageTable.uid })
    .from(MessageTable)
    .where(eq(MessageTable.mailbox_id, mailboxId))
  return rows.map((row) => row.uid)
})

const sameKeywords = (left: readonly string[] | null, right: readonly string[]): boolean => {
  const cached = [...(left ?? [])].toSorted()
  const incoming = [...right].toSorted()
  return (
    cached.length === incoming.length && cached.every((value, index) => value === incoming[index])
  )
}

interface MessageFlagsInput {
  readonly mailboxId: MailboxId
  readonly flags: readonly MessageFlags[]
}

const applyMessageFlags = Effect.fn("Message.applyFlags")(function* applyFlags(
  input: MessageFlagsInput,
) {
  if (input.flags.length === 0) {
    return 0
  }
  const database = yield* Database
  const now = yield* Clock.currentTimeMillis
  const uids = input.flags.map((flags) => flags.uid)
  const cached = yield* database.client
    .select({
      uid: MessageTable.uid,
      seen: MessageTable.seen,
      answered: MessageTable.answered,
      flagged: MessageTable.flagged,
      draft: MessageTable.draft,
      keywords: MessageTable.keywords,
    })
    .from(MessageTable)
    .where(and(eq(MessageTable.mailbox_id, input.mailboxId), inArray(MessageTable.uid, uids)))
  const cachedByUid = new Map(cached.map((row) => [row.uid, row]))
  const changed = input.flags.filter((flags) => {
    const row = cachedByUid.get(flags.uid)
    if (row === undefined) {
      return false
    }
    return (
      row.seen !== flags.seen ||
      row.answered !== flags.answered ||
      row.flagged !== flags.flagged ||
      row.draft !== flags.draft ||
      !sameKeywords(row.keywords, flags.keywords)
    )
  })
  if (changed.length === 0) {
    return 0
  }
  yield* database.client.transaction((tx) =>
    Effect.gen(function* updateFlags() {
      for (const flags of changed) {
        yield* tx
          .update(MessageTable)
          .set({
            seen: flags.seen,
            answered: flags.answered,
            flagged: flags.flagged,
            draft: flags.draft,
            keywords: flags.keywords,
            updated_at: now,
          })
          .where(and(eq(MessageTable.mailbox_id, input.mailboxId), eq(MessageTable.uid, flags.uid)))
      }
    }),
  )
  return changed.length
})

export { applyMessageFlags, listMessageUids, type MessageFlagsInput }
