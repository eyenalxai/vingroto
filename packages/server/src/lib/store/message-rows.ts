import type { AccountId, MailboxId, MessageId, Uid } from "@vingroto/core/ids"
import type { MailAddress } from "@vingroto/core/mail/address"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

import { eq } from "drizzle-orm"
import * as Effect from "effect/Effect"

import { decodeStored, persistedAddressList } from "@/lib/db/codecs"
import { Database } from "@/lib/db/database"
import { MailboxTable, MessageTable } from "@/lib/db/schema"

const listColumns = {
  id: MessageTable.id,
  uid: MessageTable.uid,
  accountId: MessageTable.account_id,
  mailboxId: MessageTable.mailbox_id,
  mailboxPath: MailboxTable.path,
  subject: MessageTable.subject,
  fromName: MessageTable.from_name,
  fromAddress: MessageTable.from_address,
  date: MessageTable.date,
  seen: MessageTable.seen,
  flagged: MessageTable.flagged,
  size: MessageTable.size,
  hasAttachments: MessageTable.has_attachments,
  snippet: MessageTable.snippet,
} as const

const searchColumns = {
  ...listColumns,
  messageId: MessageTable.message_id,
  to: MessageTable.to,
  cc: MessageTable.cc,
  bodyFetchedAt: MessageTable.body_fetched_at,
} as const

interface MessageSearchRow {
  readonly id: MessageId
  readonly uid: Uid
  readonly accountId: AccountId
  readonly mailboxId: MailboxId
  readonly mailboxPath: string
  readonly subject: string | null
  readonly fromName: string | null
  readonly fromAddress: string | null
  readonly date: number | null
  readonly seen: boolean
  readonly flagged: boolean
  readonly size: number | null
  readonly hasAttachments: boolean
  readonly snippet: string | null
  readonly messageId: string | null
  readonly to: readonly MailAddress[] | null
  readonly cc: readonly MailAddress[] | null
  readonly bodyFetchedAt: number | null
}

const decodeSearchRow = Effect.fnUntraced(function* decodeRow(row: MessageSearchRow) {
  const [to, cc] = yield* Effect.all([
    decodeStored(persistedAddressList, row.to),
    decodeStored(persistedAddressList, row.cc),
  ])
  return { ...row, to, cc }
})

const listMailboxSearchRows = Effect.fn("Message.listSearch")(function* listSearch(
  mailboxId: MailboxId,
): Effect.fn.Return<readonly MessageSearchRow[], EffectDrizzleQueryError, Database> {
  const database = yield* Database
  const rows = yield* database.client
    .select(searchColumns)
    .from(MessageTable)
    .innerJoin(MailboxTable, eq(MessageTable.mailbox_id, MailboxTable.id))
    .where(eq(MessageTable.mailbox_id, mailboxId))
  return yield* Effect.forEach(rows, (row) => decodeSearchRow(row))
})

export { listColumns, listMailboxSearchRows, searchColumns, type MessageSearchRow }
