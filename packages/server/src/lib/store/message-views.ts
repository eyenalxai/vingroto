import type { AccountId } from "@vingroto/core/ids"
import type { ListScope, MessageListItem } from "@vingroto/core/protocol/mail"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

import { and, eq } from "drizzle-orm"
import * as Effect from "effect/Effect"

import type { MessageSearchRow } from "@/lib/store/message-rows"

import { Database } from "@/lib/db/database"
import { MailboxTable, MessageTable } from "@/lib/db/schema"
import { searchColumns } from "@/lib/store/message-rows"
import { listMessages } from "@/lib/store/messages"

type VirtualListScope =
  | { readonly kind: "all" }
  | { readonly kind: "unread"; readonly accountId: AccountId | undefined }

interface UnreadMessageCounts {
  readonly total: number
  readonly byAccount: ReadonlyMap<AccountId, number>
}

interface VirtualCandidateRow extends MessageSearchRow {
  readonly specialUse: string | null
  readonly muted: boolean
}

const inboxSpecialUse = String.raw`\Inbox`
const allMailSpecialUse = String.raw`\All`

const identityKeyOf = (row: { accountId: AccountId; id: number; messageId: string | null }) =>
  `${row.accountId}\u0000${row.messageId ?? `row:${row.id}`}`

const representativeRank = (row: VirtualCandidateRow) => {
  if (row.specialUse === inboxSpecialUse) {
    return 0
  }
  if (!row.muted && row.specialUse !== allMailSpecialUse) {
    return 1
  }
  if (row.specialUse === allMailSpecialUse) {
    return 2
  }
  return 3
}

const isPreferredCopy = (candidate: VirtualCandidateRow, current: VirtualCandidateRow) => {
  const candidateRank = representativeRank(candidate)
  const currentRank = representativeRank(current)
  if (candidateRank !== currentRank) {
    return candidateRank < currentRank
  }
  if (candidate.mailboxId !== current.mailboxId) {
    return candidate.mailboxId < current.mailboxId
  }
  return candidate.uid < current.uid
}

const toSearchRow = (row: VirtualCandidateRow): MessageSearchRow => {
  return {
    id: row.id,
    uid: row.uid,
    accountId: row.accountId,
    mailboxId: row.mailboxId,
    mailboxPath: row.mailboxPath,
    subject: row.subject,
    fromName: row.fromName,
    fromAddress: row.fromAddress,
    date: row.date,
    seen: row.seen,
    flagged: row.flagged,
    size: row.size,
    hasAttachments: row.hasAttachments,
    snippet: row.snippet,
    messageId: row.messageId,
    to: row.to,
    cc: row.cc,
    bodyFetchedAt: row.bodyFetchedAt,
  }
}

const toListItem = (row: MessageSearchRow): MessageListItem => {
  return {
    id: row.id,
    uid: row.uid,
    accountId: row.accountId,
    mailboxId: row.mailboxId,
    mailboxPath: row.mailboxPath,
    subject: row.subject,
    fromName: row.fromName,
    fromAddress: row.fromAddress,
    date: row.date,
    seen: row.seen,
    flagged: row.flagged,
    size: row.size,
    hasAttachments: row.hasAttachments,
    snippet: row.snippet,
  }
}

const representatives = (rows: readonly VirtualCandidateRow[]): readonly MessageSearchRow[] => {
  const byIdentity = new Map<string, VirtualCandidateRow>()
  for (const row of rows) {
    const key = identityKeyOf(row)
    const current = byIdentity.get(key)
    if (current === undefined || isPreferredCopy(row, current)) {
      byIdentity.set(key, row)
    }
  }
  return [...byIdentity.values()].map((row) => toSearchRow(row))
}

const byNewestFirst = (left: MessageSearchRow, right: MessageSearchRow) => {
  if (left.date !== right.date) {
    if (left.date === null) {
      return 1
    }
    if (right.date === null) {
      return -1
    }
    return right.date - left.date
  }
  return right.uid - left.uid
}

const loadCandidates = Effect.fnUntraced(function* loadCandidateRows(scope: VirtualListScope) {
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
  return yield* database.client
    .select({ ...searchColumns, specialUse: MailboxTable.special_use, muted: MailboxTable.muted })
    .from(MessageTable)
    .innerJoin(MailboxTable, eq(MessageTable.mailbox_id, MailboxTable.id))
    .where(filters.length === 0 ? undefined : and(...filters))
})

const listVirtualRows = Effect.fn("Message.listVirtualRows")(function* listVirtualRows(
  scope: VirtualListScope,
): Effect.fn.Return<readonly MessageSearchRow[], EffectDrizzleQueryError, Database> {
  const rows = yield* loadCandidates(scope)
  return representatives(rows)
})

const listVirtualMessages = Effect.fn("Message.listVirtual")(function* listVirtual(
  scope: VirtualListScope,
  limit: number,
): Effect.fn.Return<readonly MessageListItem[], EffectDrizzleQueryError, Database> {
  const rows = yield* loadCandidates(scope)
  return representatives(rows)
    .toSorted(byNewestFirst)
    .slice(0, limit)
    .map((row) => toListItem(row))
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
      id: MessageTable.id,
      messageId: MessageTable.message_id,
    })
    .from(MessageTable)
    .innerJoin(MailboxTable, eq(MessageTable.mailbox_id, MailboxTable.id))
    .where(and(eq(MessageTable.seen, false), eq(MailboxTable.muted, false)))
  const byAccount = new Map<AccountId, Set<string>>()
  for (const row of rows) {
    const identities = byAccount.get(row.accountId) ?? new Set<string>()
    identities.add(identityKeyOf(row))
    byAccount.set(row.accountId, identities)
  }
  const counts = new Map<AccountId, number>()
  let total = 0
  for (const [accountId, identities] of byAccount) {
    counts.set(accountId, identities.size)
    total += identities.size
  }
  return { total, byAccount: counts }
})

export {
  listMessagesForScope,
  listVirtualMessages,
  listVirtualRows,
  unreadMessageCounts,
  type UnreadMessageCounts,
  type VirtualListScope,
}
