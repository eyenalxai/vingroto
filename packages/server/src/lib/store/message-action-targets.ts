import type { AccountId, MessageId, Uid } from "@vingroto/core/ids"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

import { and, eq, inArray, or } from "drizzle-orm"
import * as Effect from "effect/Effect"

import { Database } from "@/lib/db/database"
import { MailboxTable, MessageTable } from "@/lib/db/schema"

interface MessageActionTarget {
  readonly messageId: MessageId
  readonly accountId: AccountId
  readonly mailboxPath: string
  readonly uid: Uid
}

interface EmailActionTargets {
  readonly requested: readonly MessageActionTarget[]
  readonly copies: readonly MessageActionTarget[]
}

const actionTargetColumns = {
  messageId: MessageTable.id,
  accountId: MessageTable.account_id,
  mailboxPath: MailboxTable.path,
  uid: MessageTable.uid,
} as const

const emailActionTargetColumns = {
  ...actionTargetColumns,
  headerMessageId: MessageTable.message_id,
} as const

const toActionTarget = (row: MessageActionTarget): MessageActionTarget => {
  return {
    accountId: row.accountId,
    mailboxPath: row.mailboxPath,
    messageId: row.messageId,
    uid: row.uid,
  }
}

const listMessageActionTargets = Effect.fn("Message.actionTargets")(function* actionTargets(
  messageIds: readonly MessageId[],
) {
  if (messageIds.length === 0) {
    return []
  }
  const database = yield* Database
  return yield* database.client
    .select(actionTargetColumns)
    .from(MessageTable)
    .innerJoin(MailboxTable, eq(MessageTable.mailbox_id, MailboxTable.id))
    .where(inArray(MessageTable.id, [...messageIds]))
})

const listEmailActionTargets = Effect.fn("Message.emailActionTargets")(function* emailActionTargets(
  messageIds: readonly MessageId[],
): Effect.fn.Return<EmailActionTargets, EffectDrizzleQueryError, Database> {
  if (messageIds.length === 0) {
    return { copies: [], requested: [] }
  }
  const database = yield* Database
  const requestedRows = yield* database.client
    .select(emailActionTargetColumns)
    .from(MessageTable)
    .innerJoin(MailboxTable, eq(MessageTable.mailbox_id, MailboxTable.id))
    .where(inArray(MessageTable.id, [...messageIds]))
  const requestedIds = new Set(requestedRows.map((row) => row.messageId))
  const identities = new Set(
    requestedRows.flatMap((row) =>
      row.headerMessageId === null ? [] : [`${row.accountId}\u0000${row.headerMessageId}`],
    ),
  )
  const accountIds = [...new Set(requestedRows.map((row) => row.accountId))]
  const headerIds = [
    ...new Set(
      requestedRows.flatMap((row) => (row.headerMessageId === null ? [] : [row.headerMessageId])),
    ),
  ]
  const rows =
    headerIds.length === 0
      ? requestedRows
      : yield* database.client
          .select(emailActionTargetColumns)
          .from(MessageTable)
          .innerJoin(MailboxTable, eq(MessageTable.mailbox_id, MailboxTable.id))
          .where(
            or(
              inArray(MessageTable.id, [...messageIds]),
              and(
                inArray(MessageTable.account_id, accountIds),
                inArray(MessageTable.message_id, headerIds),
              ),
            ),
          )
  const copies = rows.filter(
    (row) =>
      requestedIds.has(row.messageId) ||
      (row.headerMessageId !== null &&
        identities.has(`${row.accountId}\u0000${row.headerMessageId}`)),
  )
  return {
    copies: copies.map((row) => toActionTarget(row)),
    requested: requestedRows.map((row) => toActionTarget(row)),
  }
})

export {
  listEmailActionTargets,
  listMessageActionTargets,
  type EmailActionTargets,
  type MessageActionTarget,
}
