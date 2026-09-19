import type { AccountId } from "@vingroto/core/ids"
import type { ListScope, MessageListItem } from "@vingroto/core/protocol/mail"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

import { and, countDistinct, desc, eq, sql } from "drizzle-orm"
import * as Effect from "effect/Effect"

import { Database } from "@/lib/db/database"
import { MailboxTable, MessageTable } from "@/lib/db/schema"
import { listColumns, listMessages } from "@/lib/store/messages"

type VirtualListScope =
  | { readonly kind: "all" }
  | { readonly kind: "unread"; readonly accountId: AccountId | undefined }

interface UnreadMessageCounts {
  readonly total: number
  readonly byAccount: ReadonlyMap<AccountId, number>
}

const inboxSpecialUse = String.raw`\Inbox`
const allMailSpecialUse = String.raw`\All`

const identityKey = sql`coalesce(${MessageTable.message_id}, 'row:' || ${MessageTable.id})`

const representativeRank = sql<number>`row_number() over (
  partition by ${MessageTable.account_id}, ${identityKey}
  order by
    case
      when ${MailboxTable.special_use} = ${inboxSpecialUse} then 0
      when ${MailboxTable.muted} = 0
        and (${MailboxTable.special_use} is null or ${MailboxTable.special_use} <> ${allMailSpecialUse}) then 1
      when ${MailboxTable.special_use} = ${allMailSpecialUse} then 2
      else 3
    end,
    ${MailboxTable.id} asc,
    ${MessageTable.uid} asc
)`

const listVirtualMessages = Effect.fn("Message.listVirtual")(function* listVirtual(
  scope: VirtualListScope,
  limit: number,
): Effect.fn.Return<readonly MessageListItem[], EffectDrizzleQueryError, Database> {
  const database = yield* Database
  const filters =
    scope.kind === "unread"
      ? scope.accountId === undefined
        ? [eq(MessageTable.seen, false), eq(MailboxTable.muted, false)]
        : [
            eq(MessageTable.seen, false),
            eq(MessageTable.account_id, scope.accountId),
            eq(MailboxTable.muted, false),
          ]
      : []
  const ranked = database.client
    .select({ ...listColumns, rank: representativeRank.as("rank") })
    .from(MessageTable)
    .innerJoin(MailboxTable, eq(MessageTable.mailbox_id, MailboxTable.id))
    .where(filters.length === 0 ? undefined : and(...filters))
    .as("ranked")
  return yield* database.client
    .select({
      id: ranked.id,
      uid: ranked.uid,
      accountId: ranked.accountId,
      mailboxId: ranked.mailboxId,
      mailboxPath: ranked.mailboxPath,
      subject: ranked.subject,
      fromName: ranked.fromName,
      fromAddress: ranked.fromAddress,
      date: ranked.date,
      seen: ranked.seen,
      flagged: ranked.flagged,
      size: ranked.size,
      hasAttachments: ranked.hasAttachments,
      snippet: ranked.snippet,
    })
    .from(ranked)
    .where(eq(ranked.rank, 1))
    .orderBy(desc(ranked.date), desc(ranked.uid))
    .limit(limit)
})

const listMessagesForScope = Effect.fn("Message.listForScope")(function* listForScope(
  scope: ListScope,
  limit: number,
): Effect.fn.Return<readonly MessageListItem[], EffectDrizzleQueryError, Database> {
  if (scope.kind === "mailbox") {
    return yield* listMessages(scope.mailboxId, limit)
  }
  if (scope.kind === "unread") {
    return yield* listVirtualMessages({ accountId: scope.accountId, kind: "unread" }, limit)
  }
  return yield* listVirtualMessages({ kind: "all" }, limit)
})

const unreadMessageCounts = Effect.fn("Message.unreadCounts")(function* countUnread() {
  const database = yield* Database
  const rows = yield* database.client
    .select({
      accountId: MessageTable.account_id,
      unread: countDistinct(identityKey),
    })
    .from(MessageTable)
    .innerJoin(MailboxTable, eq(MessageTable.mailbox_id, MailboxTable.id))
    .where(and(eq(MessageTable.seen, false), eq(MailboxTable.muted, false)))
    .groupBy(MessageTable.account_id)
    .orderBy(MessageTable.account_id)
  const byAccount = new Map<AccountId, number>()
  let total = 0
  for (const row of rows) {
    byAccount.set(row.accountId, row.unread)
    total += row.unread
  }
  return { total, byAccount }
})

export {
  listMessagesForScope,
  listVirtualMessages,
  unreadMessageCounts,
  type UnreadMessageCounts,
  type VirtualListScope,
}
