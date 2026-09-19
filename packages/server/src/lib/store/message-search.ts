import type { AccountId, MailboxId, MessageId, Uid } from "@vingroto/core/ids"
import type { ListScope, MessageTarget } from "@vingroto/core/protocol/mail"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

import { and, asc, eq, inArray } from "drizzle-orm"
import * as Effect from "effect/Effect"

import type { MessageSearchRow } from "@/lib/store/message-rows"

import { Database } from "@/lib/db/database"
import { MailboxTable, MessageBodyTable, MessageTable } from "@/lib/db/schema"
import { listMailboxSearchRows } from "@/lib/store/message-rows"
import { listVirtualRows } from "@/lib/store/message-views"

interface SearchMailbox {
  readonly id: MailboxId
  readonly accountId: AccountId
  readonly path: string
}

const listSearchRows = Effect.fn("Search.listRows")(function* listRows(
  scope: ListScope,
): Effect.fn.Return<readonly MessageSearchRow[], EffectDrizzleQueryError, Database> {
  if (scope.kind === "mailbox") {
    return yield* listMailboxSearchRows(scope.mailboxId)
  }
  if (scope.kind === "unread") {
    return yield* listVirtualRows({ accountId: scope.accountId, kind: "unread" })
  }
  return yield* listVirtualRows({ kind: "all" })
})

const listSearchMailboxes = Effect.fn("Search.listMailboxes")(function* listMailboxes(
  scope: ListScope,
): Effect.fn.Return<readonly SearchMailbox[], EffectDrizzleQueryError, Database> {
  const database = yield* Database
  if (scope.kind === "mailbox") {
    return yield* database.client
      .select({ id: MailboxTable.id, accountId: MailboxTable.account_id, path: MailboxTable.path })
      .from(MailboxTable)
      .where(eq(MailboxTable.id, scope.mailboxId))
      .limit(1)
  }
  const filters = [eq(MailboxTable.selectable, true), eq(MailboxTable.muted, false)]
  if (scope.kind === "unread" && scope.accountId !== undefined) {
    filters.push(eq(MailboxTable.account_id, scope.accountId))
  }
  return yield* database.client
    .select({ id: MailboxTable.id, accountId: MailboxTable.account_id, path: MailboxTable.path })
    .from(MailboxTable)
    .where(and(...filters))
    .orderBy(asc(MailboxTable.account_id), asc(MailboxTable.path))
})

const listMessageBodies = Effect.fn("Search.listBodies")(function* listBodies(
  messageIds: readonly MessageId[],
): Effect.fn.Return<ReadonlyMap<MessageId, string | null>, EffectDrizzleQueryError, Database> {
  const bodies = new Map<MessageId, string | null>()
  if (messageIds.length === 0) {
    return bodies
  }
  const database = yield* Database
  const rows = yield* database.client
    .select({ messageId: MessageBodyTable.message_id, text: MessageBodyTable.text })
    .from(MessageBodyTable)
    .where(inArray(MessageBodyTable.message_id, [...messageIds]))
  for (const row of rows) {
    bodies.set(row.messageId, row.text)
  }
  return bodies
})

const listMessageTargets = Effect.fn("Search.listTargets")(function* listTargets(
  messageIds: readonly MessageId[],
): Effect.fn.Return<readonly MessageTarget[], EffectDrizzleQueryError, Database> {
  if (messageIds.length === 0) {
    return []
  }
  const database = yield* Database
  return yield* database.client
    .select({
      id: MessageTable.id,
      accountId: MessageTable.account_id,
      mailboxPath: MailboxTable.path,
    })
    .from(MessageTable)
    .innerJoin(MailboxTable, eq(MessageTable.mailbox_id, MailboxTable.id))
    .where(inArray(MessageTable.id, [...messageIds]))
})

const messageIdentity = (row: Pick<MessageSearchRow, "accountId" | "messageId" | "id">) =>
  `${row.accountId}\u0000${row.messageId ?? `row:${row.id}`}`

const messageIdentitiesForUids = Effect.fn("Search.identitiesForUids")(function* identitiesForUids(
  mailboxId: MailboxId,
  uids: readonly Uid[],
): Effect.fn.Return<readonly string[], EffectDrizzleQueryError, Database> {
  if (uids.length === 0) {
    return []
  }
  const database = yield* Database
  const rows = yield* database.client
    .select({
      id: MessageTable.id,
      accountId: MessageTable.account_id,
      messageId: MessageTable.message_id,
    })
    .from(MessageTable)
    .where(and(eq(MessageTable.mailbox_id, mailboxId), inArray(MessageTable.uid, [...uids])))
  return rows.map((row) => messageIdentity(row))
})

export {
  listMessageBodies,
  listMessageTargets,
  listSearchMailboxes,
  listSearchRows,
  messageIdentitiesForUids,
  messageIdentity,
  type SearchMailbox,
}
