import * as Schema from "effect/Schema"

import { MailAddress } from "../mail/address"

const Mailbox = Schema.Struct({
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

interface Mailbox extends Schema.Schema.Type<typeof Mailbox> {}

const MailboxCounts = Schema.Struct({
  total: Schema.Int,
  unread: Schema.Int,
})

interface MailboxCounts extends Schema.Schema.Type<typeof MailboxCounts> {}

const FolderScope = Schema.Union([
  Schema.Struct({ kind: Schema.tag("all") }),
  Schema.Struct({ kind: Schema.tag("unread"), accountId: Schema.optionalKey(Schema.String) }),
  Schema.Struct({ kind: Schema.tag("mailbox"), mailboxId: Schema.Int }),
]).pipe(Schema.toTaggedUnion("kind"))

type FolderScope = typeof FolderScope.Type

const FolderSnapshot = Schema.Struct({
  mailboxes: Schema.Array(Mailbox),
  counts: Schema.Array(
    Schema.Struct({
      mailboxId: Schema.Int,
      counts: MailboxCounts,
    }),
  ),
  unread: Schema.Int,
})

interface FolderSnapshot extends Schema.Schema.Type<typeof FolderSnapshot> {}

const MessageListItem = Schema.Struct({
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
})

interface MessageListItem extends Schema.Schema.Type<typeof MessageListItem> {}

const MessageDetail = Schema.Struct({
  ...MessageListItem.fields,
  mailboxName: Schema.String,
  messageId: Schema.NullOr(Schema.String),
  inReplyTo: Schema.NullOr(Schema.String),
  to: Schema.NullOr(Schema.Array(MailAddress)),
  cc: Schema.NullOr(Schema.Array(MailAddress)),
  answered: Schema.Boolean,
  draft: Schema.Boolean,
})

interface MessageDetail extends Schema.Schema.Type<typeof MessageDetail> {}

const MessageBody = Schema.Struct({
  text: Schema.NullOr(Schema.String),
  html: Schema.NullOr(Schema.String),
})

interface MessageBody extends Schema.Schema.Type<typeof MessageBody> {}

const SeenOutcome = Schema.Struct({
  affected: Schema.Int,
  errors: Schema.Array(Schema.String),
})

interface SeenOutcome extends Schema.Schema.Type<typeof SeenOutcome> {}

const MoveOutcome = Schema.Struct({
  moved: Schema.Int,
  skipped: Schema.Int,
  errors: Schema.Array(Schema.String),
})

interface MoveOutcome extends Schema.Schema.Type<typeof MoveOutcome> {}

const SyncReport = Schema.Struct({
  accountId: Schema.String,
  mailboxes: Schema.Int,
  fetched: Schema.Int,
  stored: Schema.Int,
  errors: Schema.Array(Schema.String),
})

interface SyncReport extends Schema.Schema.Type<typeof SyncReport> {}

export {
  FolderScope,
  FolderSnapshot,
  Mailbox,
  MailboxCounts,
  MessageBody,
  MessageDetail,
  MessageListItem,
  MoveOutcome,
  SeenOutcome,
  SyncReport,
}
