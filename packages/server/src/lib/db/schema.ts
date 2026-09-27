import type { AccountId, DraftId, MailboxId, MessageId, OutboxId, Uid } from "@vingroto/core/ids"
import type { MailAddress } from "@vingroto/core/mail/address"

import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

const timestamps = {
  created_at: integer().notNull(),
  updated_at: integer().notNull(),
}

const MailboxTable = sqliteTable(
  "mailbox",
  {
    id: integer().primaryKey({ autoIncrement: true }).$type<MailboxId>(),
    account_id: text().notNull().$type<AccountId>(),
    path: text().notNull(),
    name: text().notNull(),
    delimiter: text().notNull(),
    special_use: text(),
    selectable: integer({ mode: "boolean" }).notNull(),
    muted: integer({ mode: "boolean" }).notNull().default(false),
    uid_validity: integer(),
    last_seen_uid: integer()
      .notNull()
      .$default(() => 0)
      .$type<Uid>(),
    synced_at: integer(),
    ...timestamps,
  },
  (table) => [uniqueIndex("mailbox_account_id_path_unique").on(table.account_id, table.path)],
)

const MessageTable = sqliteTable(
  "message",
  {
    id: integer().primaryKey({ autoIncrement: true }).$type<MessageId>(),
    account_id: text().notNull().$type<AccountId>(),
    mailbox_id: integer()
      .notNull()
      .references(() => MailboxTable.id, { onDelete: "cascade" })
      .$type<MailboxId>(),
    uid: integer().notNull().$type<Uid>(),
    message_id: text(),
    in_reply_to: text(),
    references: text({ mode: "json" }).$type<readonly string[]>(),
    subject: text(),
    from_name: text(),
    from_address: text(),
    to: text({ mode: "json" }).$type<readonly MailAddress[]>(),
    cc: text({ mode: "json" }).$type<readonly MailAddress[]>(),
    date: integer(),
    size: integer(),
    seen: integer({ mode: "boolean" })
      .notNull()
      .$default(() => false),
    answered: integer({ mode: "boolean" })
      .notNull()
      .$default(() => false),
    flagged: integer({ mode: "boolean" })
      .notNull()
      .$default(() => false),
    draft: integer({ mode: "boolean" })
      .notNull()
      .$default(() => false),
    keywords: text({ mode: "json" }).$type<readonly string[]>(),
    snippet: text(),
    has_attachments: integer({ mode: "boolean" })
      .notNull()
      .$default(() => false),
    body_fetched_at: integer(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("message_mailbox_id_uid_unique").on(table.mailbox_id, table.uid),
    index("message_account_id_date_index").on(table.account_id, table.date),
    index("message_body_fetched_at_index").on(table.body_fetched_at),
  ],
)

const MessageBodyTable = sqliteTable("message_body", {
  message_id: integer()
    .primaryKey()
    .references(() => MessageTable.id, { onDelete: "cascade" })
    .$type<MessageId>(),
  text: text(),
  html: text(),
  fetched_at: integer().notNull(),
})

const AttachmentTable = sqliteTable(
  "attachment",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    message_id: integer()
      .notNull()
      .references(() => MessageTable.id, { onDelete: "cascade" })
      .$type<MessageId>(),
    part: text(),
    filename: text(),
    mime_type: text(),
    size: integer(),
    content_id: text(),
    inline: integer({ mode: "boolean" })
      .notNull()
      .$default(() => false),
    ...timestamps,
  },
  (table) => [index("attachment_message_id_index").on(table.message_id)],
)

const OutboxTable = sqliteTable(
  "outbox",
  {
    id: integer().primaryKey({ autoIncrement: true }).$type<OutboxId>(),
    account_id: text().notNull().$type<AccountId>(),
    to: text({ mode: "json" }).notNull().$type<readonly MailAddress[]>(),
    cc: text({ mode: "json" }).notNull().default([]).$type<readonly MailAddress[]>(),
    bcc: text({ mode: "json" }).notNull().default([]).$type<readonly MailAddress[]>(),
    subject: text().notNull().default(""),
    body: text().notNull().default(""),
    in_reply_to: text(),
    references: text({ mode: "json" }).notNull().default([]).$type<readonly string[]>(),
    send_at: integer().notNull(),
    attempts: integer().notNull().default(0),
    state: text().notNull().default("pending").$type<"pending" | "failed">(),
    last_error: text(),
    ...timestamps,
  },
  (table) => [index("outbox_state_send_at_index").on(table.state, table.send_at)],
)

const DraftTable = sqliteTable("draft", {
  id: integer().primaryKey({ autoIncrement: true }).$type<DraftId>(),
  account_id: text().notNull().$type<AccountId>(),
  to: text({ mode: "json" }).notNull().$type<readonly MailAddress[]>(),
  cc: text({ mode: "json" }).notNull().default([]).$type<readonly MailAddress[]>(),
  bcc: text({ mode: "json" }).notNull().default([]).$type<readonly MailAddress[]>(),
  subject: text().notNull().default(""),
  body: text().notNull().default(""),
  in_reply_to: text(),
  references: text({ mode: "json" }).notNull().default([]).$type<readonly string[]>(),
  ...timestamps,
})

export { AttachmentTable, DraftTable, MailboxTable, MessageBodyTable, MessageTable, OutboxTable }
