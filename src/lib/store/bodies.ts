import { and, desc, eq, isNull } from "drizzle-orm"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"

import { Database } from "@/lib/db/database"
import { MailboxTable, MessageBodyTable, MessageTable } from "@/lib/db/schema"
import { toSnippet } from "@/lib/format"

interface MessageBody {
  readonly text: string | null
  readonly html: string | null
}

interface PendingBody {
  readonly messageId: number
  readonly accountId: string
  readonly mailboxPath: string
  readonly uid: number
}

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

const listPendingBodies = Effect.fn("Message.listPendingBodies")(function* listPending() {
  const database = yield* Database
  return yield* database.client
    .select({
      messageId: MessageTable.id,
      accountId: MessageTable.account_id,
      mailboxPath: MailboxTable.path,
      uid: MessageTable.uid,
    })
    .from(MessageTable)
    .innerJoin(MailboxTable, eq(MessageTable.mailbox_id, MailboxTable.id))
    .where(
      and(
        eq(MessageTable.seen, false),
        eq(MailboxTable.muted, false),
        isNull(MessageTable.body_fetched_at),
      ),
    )
    .orderBy(desc(MessageTable.date), desc(MessageTable.uid))
})

export { getMessageBody, listPendingBodies, storeMessageBody, type MessageBody, type PendingBody }
