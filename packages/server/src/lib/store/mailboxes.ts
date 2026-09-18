import type { AccountId, MailboxId, Uid } from "@vingroto/core/ids"

import { asc, eq } from "drizzle-orm"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"

import type { MailboxInfo } from "@/lib/mail/imap-types"

import { Database } from "@/lib/db/database"
import { MailboxTable } from "@/lib/db/schema"

type MailboxRow = typeof MailboxTable.$inferSelect

interface MailboxSyncState {
  readonly uidValidity: number
  readonly lastSeenUid: Uid
  readonly syncedAt: number | null
}

const listMailboxes = Effect.fn("Mailbox.listAll")(function* listAll() {
  const database = yield* Database
  return yield* database.client
    .select()
    .from(MailboxTable)
    .orderBy(asc(MailboxTable.account_id), asc(MailboxTable.path))
})

const listAccountMailboxes = Effect.fn("Mailbox.listForAccount")(function* listForAccount(
  accountId: AccountId,
) {
  const database = yield* Database
  return yield* database.client
    .select()
    .from(MailboxTable)
    .where(eq(MailboxTable.account_id, accountId))
    .orderBy(asc(MailboxTable.path))
})

const upsertMailboxes = Effect.fn("Mailbox.upsert")(function* upsert(
  accountId: AccountId,
  infos: readonly MailboxInfo[],
) {
  const database = yield* Database
  const now = yield* Clock.currentTimeMillis
  yield* Effect.all(
    infos.map((info) =>
      database.client
        .insert(MailboxTable)
        .values({
          account_id: accountId,
          path: info.path,
          name: info.name,
          delimiter: info.delimiter,
          special_use: info.specialUse ?? null,
          selectable: info.selectable,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: [MailboxTable.account_id, MailboxTable.path],
          set: {
            name: info.name,
            delimiter: info.delimiter,
            special_use: info.specialUse ?? null,
            selectable: info.selectable,
            updated_at: now,
          },
        }),
    ),
    { discard: true },
  )
})

const setMailboxMuted = Effect.fn("Mailbox.setMuted")(function* setMuted(
  mailboxId: MailboxId,
  muted: boolean,
) {
  const database = yield* Database
  const now = yield* Clock.currentTimeMillis
  yield* database.client
    .update(MailboxTable)
    .set({ muted, updated_at: now })
    .where(eq(MailboxTable.id, mailboxId))
})

const setMailboxSyncState = Effect.fn("Mailbox.setSyncState")(function* setSyncState(
  mailboxId: MailboxId,
  state: MailboxSyncState,
) {
  const database = yield* Database
  const now = yield* Clock.currentTimeMillis
  yield* database.client
    .update(MailboxTable)
    .set({
      uid_validity: state.uidValidity,
      last_seen_uid: state.lastSeenUid,
      synced_at: state.syncedAt,
      updated_at: now,
    })
    .where(eq(MailboxTable.id, mailboxId))
})

export {
  listAccountMailboxes,
  listMailboxes,
  setMailboxMuted,
  setMailboxSyncState,
  upsertMailboxes,
  type MailboxRow,
  type MailboxSyncState,
}
