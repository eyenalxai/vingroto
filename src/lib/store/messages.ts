import { and, count, desc, eq, inArray } from "drizzle-orm"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"

import type { MailAddress } from "@/lib/mail/address"
import type { MessageEnvelope } from "@/lib/mail/imap-types"

import { Database } from "@/lib/db/database"
import { MailboxTable, MessageBodyTable, MessageTable } from "@/lib/db/schema"
import { toSnippet } from "@/lib/format"

interface MessageListItem {
  readonly id: number
  readonly uid: number
  readonly accountId: string
  readonly mailboxId: number
  readonly mailboxPath: string
  readonly mailboxName: string
  readonly subject: string | null
  readonly fromName: string | null
  readonly fromAddress: string | null
  readonly date: number | null
  readonly seen: boolean
  readonly flagged: boolean
  readonly size: number | null
  readonly hasAttachments: boolean
  readonly snippet: string | null
}

interface MessageDetail extends MessageListItem {
  readonly messageId: string | null
  readonly inReplyTo: string | null
  readonly to: readonly MailAddress[] | null
  readonly cc: readonly MailAddress[] | null
  readonly answered: boolean
  readonly draft: boolean
}

interface MailboxCounts {
  readonly total: number
  readonly unread: number
}

interface VirtualCounts {
  readonly all: number
  readonly unread: number
}

interface MessageBody {
  readonly text: string | null
  readonly html: string | null
}

interface MessageStoreInput {
  readonly accountId: string
  readonly mailboxId: number
  readonly envelopes: readonly MessageEnvelope[]
}

interface MessageStoreOutcome {
  readonly inserted: number
  readonly updated: number
}

type VirtualFolderKind = "all" | "unread"

const listColumns = {
  id: MessageTable.id,
  uid: MessageTable.uid,
  accountId: MessageTable.account_id,
  mailboxId: MessageTable.mailbox_id,
  mailboxPath: MailboxTable.path,
  mailboxName: MailboxTable.name,
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
  const outcome: { inserted: number; updated: number } = { inserted: 0, updated: 0 }
  if (input.envelopes.length === 0) {
    return outcome
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
    outcome.inserted = fresh.length
  }
  for (const envelope of stale) {
    yield* database.client
      .update(MessageTable)
      .set(toEnvelopeColumns(envelope, now))
      .where(and(eq(MessageTable.mailbox_id, input.mailboxId), eq(MessageTable.uid, envelope.uid)))
    outcome.updated += 1
  }
  return outcome
})

const deleteMailboxMessages = Effect.fn("Message.deleteForMailbox")(function* deleteForMailbox(
  mailboxId: number,
) {
  const database = yield* Database
  yield* database.client.delete(MessageTable).where(eq(MessageTable.mailbox_id, mailboxId))
})

const listMessages = Effect.fn("Message.list")(function* list(mailboxId: number, limit: number) {
  const database = yield* Database
  return yield* database.client
    .select(listColumns)
    .from(MessageTable)
    .innerJoin(MailboxTable, eq(MessageTable.mailbox_id, MailboxTable.id))
    .where(eq(MessageTable.mailbox_id, mailboxId))
    .orderBy(desc(MessageTable.date), desc(MessageTable.uid))
    .limit(limit)
})

const listVirtualMessages = Effect.fn("Message.listVirtual")(function* listVirtual(
  kind: VirtualFolderKind,
  limit: number,
) {
  const database = yield* Database
  if (kind === "unread") {
    return yield* database.client
      .select(listColumns)
      .from(MessageTable)
      .innerJoin(MailboxTable, eq(MessageTable.mailbox_id, MailboxTable.id))
      .where(eq(MessageTable.seen, false))
      .orderBy(desc(MessageTable.date), desc(MessageTable.uid))
      .limit(limit)
  }
  return yield* database.client
    .select(listColumns)
    .from(MessageTable)
    .innerJoin(MailboxTable, eq(MessageTable.mailbox_id, MailboxTable.id))
    .orderBy(desc(MessageTable.date), desc(MessageTable.uid))
    .limit(limit)
})

const getMessage = Effect.fn("Message.get")(function* get(messageId: number) {
  const database = yield* Database
  const rows = yield* database.client
    .select({
      ...listColumns,
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

const getMessageBody = Effect.fn("Message.getBody")(function* getBody(messageId: number) {
  const database = yield* Database
  const rows = yield* database.client
    .select({ text: MessageBodyTable.text, html: MessageBodyTable.html })
    .from(MessageBodyTable)
    .where(eq(MessageBodyTable.message_id, messageId))
    .limit(1)
  return rows[0]
})

const storeMessageBody = Effect.fn("Message.storeBody")(function* storeBody(
  messageId: number,
  body: MessageBody,
  hasAttachments: boolean,
) {
  const database = yield* Database
  const now = yield* Clock.currentTimeMillis
  yield* database.client
    .insert(MessageBodyTable)
    .values({ message_id: messageId, text: body.text, html: body.html, fetched_at: now })
    .onConflictDoUpdate({
      target: MessageBodyTable.message_id,
      set: { text: body.text, html: body.html, fetched_at: now },
    })
  yield* database.client
    .update(MessageTable)
    .set({
      body_fetched_at: now,
      snippet: toSnippet(body.text),
      has_attachments: hasAttachments,
      updated_at: now,
    })
    .where(eq(MessageTable.id, messageId))
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
    .where(eq(MessageTable.seen, false))
    .groupBy(MessageTable.mailbox_id)
  const result = new Map<number, MailboxCounts>()
  for (const row of totals) {
    result.set(row.mailboxId, { total: row.total, unread: 0 })
  }
  for (const row of unread) {
    const current = result.get(row.mailboxId)
    result.set(row.mailboxId, { total: current?.total ?? 0, unread: row.unread })
  }
  return result
})

const virtualCounts = Effect.fn("Message.virtualCounts")(function* countsForVirtualFolders() {
  const database = yield* Database
  const totals = yield* database.client.select({ value: count() }).from(MessageTable)
  const unread = yield* database.client
    .select({ value: count() })
    .from(MessageTable)
    .where(eq(MessageTable.seen, false))
  return { all: totals[0]?.value ?? 0, unread: unread[0]?.value ?? 0 }
})

export {
  deleteMailboxMessages,
  getMessage,
  getMessageBody,
  listMessages,
  listVirtualMessages,
  messageCounts,
  storeMessageBody,
  storeMessages,
  virtualCounts,
  type MailboxCounts,
  type MessageBody,
  type MessageDetail,
  type MessageListItem,
  type MessageStoreOutcome,
  type VirtualCounts,
  type VirtualFolderKind,
}
