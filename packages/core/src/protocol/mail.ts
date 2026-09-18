import * as Schema from "effect/Schema"

import { MailAddressSchema } from "../mail/address"

const MailboxSchema = Schema.Struct({
  id: Schema.Int,
  account_id: Schema.String,
  path: Schema.String,
  name: Schema.String,
  delimiter: Schema.String,
  special_use: Schema.NullOr(Schema.String),
  selectable: Schema.Boolean,
  muted: Schema.Boolean,
  uid_validity: Schema.NullOr(Schema.Int),
  last_seen_uid: Schema.Int,
  synced_at: Schema.NullOr(Schema.Int),
  created_at: Schema.Int,
  updated_at: Schema.Int,
})

type Mailbox = typeof MailboxSchema.Type

const MailboxCountsSchema = Schema.Struct({
  total: Schema.Int,
  unread: Schema.Int,
})

type MailboxCounts = typeof MailboxCountsSchema.Type

const FolderScopeSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("all") }),
  Schema.Struct({ kind: Schema.Literal("unread"), accountId: Schema.optional(Schema.String) }),
  Schema.Struct({ kind: Schema.Literal("mailbox"), mailboxId: Schema.Int }),
])

type FolderScope = typeof FolderScopeSchema.Type

const FolderSnapshotSchema = Schema.Struct({
  mailboxes: Schema.Array(MailboxSchema),
  counts: Schema.Array(
    Schema.Struct({
      mailboxId: Schema.Int,
      counts: MailboxCountsSchema,
    }),
  ),
  unread: Schema.Int,
})

type FolderSnapshot = typeof FolderSnapshotSchema.Type

const messageListFields = {
  id: Schema.Int,
  uid: Schema.Int,
  accountId: Schema.String,
  mailboxId: Schema.Int,
  mailboxPath: Schema.String,
  subject: Schema.NullOr(Schema.String),
  fromName: Schema.NullOr(Schema.String),
  fromAddress: Schema.NullOr(Schema.String),
  date: Schema.NullOr(Schema.Int),
  seen: Schema.Boolean,
  flagged: Schema.Boolean,
  size: Schema.NullOr(Schema.Int),
  hasAttachments: Schema.Boolean,
  snippet: Schema.NullOr(Schema.String),
} as const

const MessageListItemSchema = Schema.Struct(messageListFields)

type MessageListItem = typeof MessageListItemSchema.Type

const MessageDetailSchema = Schema.Struct({
  ...messageListFields,
  mailboxName: Schema.String,
  messageId: Schema.NullOr(Schema.String),
  inReplyTo: Schema.NullOr(Schema.String),
  to: Schema.NullOr(Schema.Array(MailAddressSchema)),
  cc: Schema.NullOr(Schema.Array(MailAddressSchema)),
  answered: Schema.Boolean,
  draft: Schema.Boolean,
})

type MessageDetail = typeof MessageDetailSchema.Type

const MessageBodySchema = Schema.Struct({
  text: Schema.NullOr(Schema.String),
  html: Schema.NullOr(Schema.String),
})

type MessageBody = typeof MessageBodySchema.Type

const SeenOutcomeSchema = Schema.Struct({
  affected: Schema.Int,
  errors: Schema.Array(Schema.String),
})

type SeenOutcome = typeof SeenOutcomeSchema.Type

const MoveOutcomeSchema = Schema.Struct({
  moved: Schema.Int,
  skipped: Schema.Int,
  errors: Schema.Array(Schema.String),
})

type MoveOutcome = typeof MoveOutcomeSchema.Type

const SyncReportSchema = Schema.Struct({
  accountId: Schema.String,
  mailboxes: Schema.Int,
  fetched: Schema.Int,
  stored: Schema.Int,
  errors: Schema.Array(Schema.String),
})

type SyncReport = typeof SyncReportSchema.Type

export {
  FolderScopeSchema,
  FolderSnapshotSchema,
  MailboxCountsSchema,
  MailboxSchema,
  MessageBodySchema,
  MessageDetailSchema,
  MessageListItemSchema,
  MoveOutcomeSchema,
  SeenOutcomeSchema,
  SyncReportSchema,
  type FolderScope,
  type FolderSnapshot,
  type Mailbox,
  type MailboxCounts,
  type MessageBody,
  type MessageDetail,
  type MessageListItem,
  type MoveOutcome,
  type SeenOutcome,
  type SyncReport,
}
