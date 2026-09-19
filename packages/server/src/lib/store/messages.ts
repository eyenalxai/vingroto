import type { AccountId, MailboxId, MessageId } from "@vingroto/core/ids"
import type { MessageDetail, MessageListItem } from "@vingroto/core/protocol/mail"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

import { and, count, desc, eq, inArray } from "drizzle-orm"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"

import type { MessageEnvelope } from "@/lib/mail/imap-types"

import { Database } from "@/lib/db/database"
import { MailboxTable, MessageTable } from "@/lib/db/schema"

interface MailboxCounts {
  readonly total: number
  readonly unread: number
}

interface MessageStoreInput {
  readonly accountId: AccountId
  readonly mailboxId: MailboxId
  readonly envelopes: readonly MessageEnvelope[]
}

interface MessageStoreOutcome {
  readonly inserted: number
  readonly updated: number
}

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

const toEnvelopeColumns = (envelope: MessageEnvelope, now: number) => {
  const sender = envelope.from[0]
  return {
    message_id: envelope.messageId ?? null,
    in_reply_to: envelope.inReplyTo ?? null,
    subject: envelope.subject ?? null,
    from_name: sender?.name ?? null,
    from_address: sender?.address ?? null,
    to: envelope.to,
    cc: envelope.cc,
    date: envelope.date ?? null,
    size: envelope.size ?? null,
    seen: envelope.seen,
    answered: envelope.answered,
    flagged: envelope.flagged,
    draft: envelope.draft,
    keywords: envelope.keywords,
    updated_at: now,
  }
}

const storeMessages = Effect.fn("Message.store")(function* store(input: MessageStoreInput) {
  if (input.envelopes.length === 0) {
    return { inserted: 0, updated: 0 }
  }
  const database = yield* Database
  const now = yield* Clock.currentTimeMillis
  const uids = input.envelopes.map((envelope) => envelope.uid)
  const known = yield* database.client
    .select({ uid: MessageTable.uid })
    .from(MessageTable)
    .where(and(eq(MessageTable.mailbox_id, input.mailboxId), inArray(MessageTable.uid, uids)))
  const knownUids = new Set(known.map((row) => row.uid))
  const fresh = input.envelopes.filter((envelope) => !knownUids.has(envelope.uid))
  const stale = input.envelopes.filter((envelope) => knownUids.has(envelope.uid))
  if (fresh.length > 0) {
    yield* database.client
      .insert(MessageTable)
      .values(
        fresh.map((envelope) => {
          return {
            account_id: input.accountId,
            mailbox_id: input.mailboxId,
            uid: envelope.uid,
            ...toEnvelopeColumns(envelope, now),
          }
        }),
      )
      .onConflictDoNothing()
  }
  yield* Effect.all(
    stale.map((envelope) =>
      database.client
        .update(MessageTable)
        .set(toEnvelopeColumns(envelope, now))
        .where(
          and(eq(MessageTable.mailbox_id, input.mailboxId), eq(MessageTable.uid, envelope.uid)),
        ),
    ),
    { discard: true },
  )
  return { inserted: fresh.length, updated: stale.length }
})

const deleteMailboxMessages = Effect.fn("Message.deleteForMailbox")(function* deleteForMailbox(
  mailboxId: MailboxId,
) {
  const database = yield* Database
  yield* database.client.delete(MessageTable).where(eq(MessageTable.mailbox_id, mailboxId))
})

const listMessages = Effect.fn("Message.list")(function* list(
  mailboxId: MailboxId,
  limit: number,
): Effect.fn.Return<readonly MessageListItem[], EffectDrizzleQueryError, Database> {
  const database = yield* Database
  return yield* database.client
    .select(listColumns)
    .from(MessageTable)
    .innerJoin(MailboxTable, eq(MessageTable.mailbox_id, MailboxTable.id))
    .where(eq(MessageTable.mailbox_id, mailboxId))
    .orderBy(desc(MessageTable.date), desc(MessageTable.uid))
    .limit(limit)
})

const getMessage = Effect.fn("Message.get")(function* get(
  messageId: MessageId,
): Effect.fn.Return<MessageDetail | undefined, EffectDrizzleQueryError, Database> {
  const database = yield* Database
  const rows = yield* database.client
    .select({
      ...listColumns,
      mailboxName: MailboxTable.name,
      messageId: MessageTable.message_id,
      inReplyTo: MessageTable.in_reply_to,
      to: MessageTable.to,
      cc: MessageTable.cc,
      answered: MessageTable.answered,
      draft: MessageTable.draft,
    })
    .from(MessageTable)
    .innerJoin(MailboxTable, eq(MessageTable.mailbox_id, MailboxTable.id))
    .where(eq(MessageTable.id, messageId))
    .limit(1)
  return rows[0]
})

const messageCounts = Effect.fn("Message.counts")(function* countsForMailboxes() {
  const database = yield* Database
  const totals = yield* database.client
    .select({ mailboxId: MessageTable.mailbox_id, total: count() })
    .from(MessageTable)
    .groupBy(MessageTable.mailbox_id)
  const unread = yield* database.client
    .select({ mailboxId: MessageTable.mailbox_id, unread: count() })
    .from(MessageTable)
    .innerJoin(MailboxTable, eq(MessageTable.mailbox_id, MailboxTable.id))
    .where(eq(MessageTable.seen, false))
    .groupBy(MessageTable.mailbox_id)
  const result = new Map<MailboxId, MailboxCounts>()
  for (const row of totals) {
    result.set(row.mailboxId, { total: row.total, unread: 0 })
  }
  for (const row of unread) {
    const current = result.get(row.mailboxId)
    result.set(row.mailboxId, { total: current?.total ?? 0, unread: row.unread })
  }
  return result
})

const setMessagesSeen = Effect.fn("Message.setSeen")(function* setSeen(
  messageIds: readonly MessageId[],
  seen: boolean,
) {
  if (messageIds.length === 0) {
    return
  }
  const database = yield* Database
  const now = yield* Clock.currentTimeMillis
  yield* database.client
    .update(MessageTable)
    .set({ seen, updated_at: now })
    .where(inArray(MessageTable.id, [...messageIds]))
})

const deleteMessages = Effect.fn("Message.delete")(function* removeMessages(
  messageIds: readonly MessageId[],
) {
  if (messageIds.length === 0) {
    return
  }
  const database = yield* Database
  yield* database.client.delete(MessageTable).where(inArray(MessageTable.id, [...messageIds]))
})

export {
  deleteMailboxMessages,
  deleteMessages,
  getMessage,
  listColumns,
  listMessages,
  messageCounts,
  setMessagesSeen,
  storeMessages,
  type MailboxCounts,
  type MessageStoreOutcome,
}
