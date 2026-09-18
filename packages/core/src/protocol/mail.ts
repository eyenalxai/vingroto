import * as Schema from "effect/Schema"

import { AccountId, MailboxId, MessageId, Uid } from "../ids"
import { MailAddress } from "../mail/address"

const Mailbox = Schema.Struct({
  id: MailboxId,
  account_id: AccountId,
  path: Schema.String,
  name: Schema.String,
  delimiter: Schema.String,
  special_use: Schema.NullOr(Schema.String),
  selectable: Schema.Boolean,
  muted: Schema.Boolean,
  uid_validity: Schema.NullOr(Schema.Int),
  last_seen_uid: Uid,
  synced_at: Schema.NullOr(Schema.Int),
  created_at: Schema.Int,
  updated_at: Schema.Int,
})

type Mailbox = Schema.Schema.Type<typeof Mailbox>

const MailboxCounts = Schema.Struct({
  total: Schema.Int,
  unread: Schema.Int,
})

type MailboxCounts = Schema.Schema.Type<typeof MailboxCounts>

const ListScope = Schema.Union([
  Schema.Struct({ kind: Schema.tag("all") }),
  Schema.Struct({ kind: Schema.tag("unread"), accountId: Schema.optionalKey(AccountId) }),
  Schema.Struct({ kind: Schema.tag("mailbox"), mailboxId: MailboxId }),
]).pipe(Schema.toTaggedUnion("kind"))

type ListScope = typeof ListScope.Type

const MailboxSnapshot = Schema.Struct({
  mailboxes: Schema.Array(Mailbox),
  counts: Schema.Array(
    Schema.Struct({
      mailboxId: MailboxId,
      counts: MailboxCounts,
    }),
  ),
  unread: Schema.Int,
})

type MailboxSnapshot = Schema.Schema.Type<typeof MailboxSnapshot>

const MessageListItem = Schema.Struct({
  id: MessageId,
  uid: Uid,
  accountId: AccountId,
  mailboxId: MailboxId,
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

type MessageListItem = Schema.Schema.Type<typeof MessageListItem>

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

type MessageDetail = Schema.Schema.Type<typeof MessageDetail>

const MessageBody = Schema.Struct({
  text: Schema.NullOr(Schema.String),
  html: Schema.NullOr(Schema.String),
})

type MessageBody = Schema.Schema.Type<typeof MessageBody>

const SeenOutcome = Schema.Struct({
  affected: Schema.Int,
  errors: Schema.Array(Schema.String),
})

type SeenOutcome = Schema.Schema.Type<typeof SeenOutcome>

const MoveOutcome = Schema.Struct({
  moved: Schema.Int,
  skipped: Schema.Int,
  errors: Schema.Array(Schema.String),
})

type MoveOutcome = Schema.Schema.Type<typeof MoveOutcome>

const SyncReport = Schema.Struct({
  accountId: AccountId,
  mailboxes: Schema.Int,
  fetched: Schema.Int,
  stored: Schema.Int,
  errors: Schema.Array(Schema.String),
})

type SyncReport = Schema.Schema.Type<typeof SyncReport>

export {
  ListScope,
  MailboxSnapshot,
  Mailbox,
  MailboxCounts,
  MessageBody,
  MessageDetail,
  MessageListItem,
  MoveOutcome,
  SeenOutcome,
  SyncReport,
}
