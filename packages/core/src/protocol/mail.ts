import * as Schema from "effect/Schema"

import { AccountId, MailboxId, MessageId, Uid } from "../ids"
import { MailAddress } from "../mail/address"

const Mailbox = Schema.Struct({
  id: MailboxId,
  accountId: AccountId,
  path: Schema.String,
  name: Schema.String,
  delimiter: Schema.String,
  specialUse: Schema.NullOr(Schema.String),
  selectable: Schema.Boolean,
  muted: Schema.Boolean,
  uidValidity: Schema.NullOr(Schema.Int),
  lastSeenUid: Uid,
  syncedAt: Schema.NullOr(Schema.Int),
  createdAt: Schema.Int,
  updatedAt: Schema.Int,
})

type Mailbox = typeof Mailbox.Type

const MailboxCounts = Schema.Struct({
  total: Schema.Int,
  unread: Schema.Int,
})

type MailboxCounts = typeof MailboxCounts.Type

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
  accountUnread: Schema.Array(
    Schema.Struct({
      accountId: AccountId,
      unread: Schema.Int,
    }),
  ),
})

type MailboxSnapshot = typeof MailboxSnapshot.Type

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

type MessageListItem = typeof MessageListItem.Type

const MessageDetail = Schema.Struct({
  ...MessageListItem.fields,
  mailboxName: Schema.String,
  messageId: Schema.NullOr(Schema.String),
  inReplyTo: Schema.NullOr(Schema.String),
  references: Schema.NullOr(Schema.Array(Schema.String)),
  to: Schema.NullOr(Schema.Array(MailAddress)),
  cc: Schema.NullOr(Schema.Array(MailAddress)),
  answered: Schema.Boolean,
  draft: Schema.Boolean,
})

type MessageDetail = typeof MessageDetail.Type

const MessageBody = Schema.Struct({
  text: Schema.NullOr(Schema.String),
  html: Schema.NullOr(Schema.String),
})

type MessageBody = typeof MessageBody.Type

const ActionFailure = Schema.Union([
  Schema.TaggedStruct("imap", {
    accountId: AccountId,
    mailboxPath: Schema.String,
    operation: Schema.String,
    message: Schema.String,
  }),
  Schema.TaggedStruct("keyring", {
    accountId: AccountId,
    mailboxPath: Schema.String,
    operation: Schema.Literals(["lookup", "store"]),
    message: Schema.String,
  }),
  Schema.TaggedStruct("credential-missing", {
    accountId: AccountId,
    mailboxPath: Schema.String,
    reference: Schema.String,
    message: Schema.String,
  }),
  Schema.TaggedStruct("oauth", {
    accountId: AccountId,
    mailboxPath: Schema.String,
    message: Schema.String,
    reauthorizationRequired: Schema.Boolean,
  }),
  Schema.TaggedStruct("cache-write", {
    accountId: AccountId,
    message: Schema.String,
  }),
  Schema.TaggedStruct("account-not-configured", {
    accountId: AccountId,
  }),
  Schema.TaggedStruct("messages-not-found", {
    count: Schema.Int,
  }),
]).pipe(Schema.toTaggedUnion("_tag"))

type ActionFailure = typeof ActionFailure.Type

const SyncFailure = Schema.Union([
  Schema.TaggedStruct("mailbox", {
    accountId: AccountId,
    mailboxPath: Schema.String,
    message: Schema.String,
  }),
  Schema.TaggedStruct("oauth", {
    accountId: AccountId,
    message: Schema.String,
    reauthorizationRequired: Schema.Boolean,
  }),
  Schema.TaggedStruct("sync", {
    accountId: AccountId,
    message: Schema.String,
  }),
]).pipe(Schema.toTaggedUnion("_tag"))

type SyncFailure = typeof SyncFailure.Type

const SeenOutcome = Schema.Struct({
  affected: Schema.Int,
  errors: Schema.Array(ActionFailure),
})

type SeenOutcome = typeof SeenOutcome.Type

const MoveOutcome = Schema.Struct({
  moved: Schema.Int,
  skipped: Schema.Int,
  errors: Schema.Array(ActionFailure),
})

type MoveOutcome = typeof MoveOutcome.Type

const SyncReport = Schema.Struct({
  accountId: AccountId,
  mailboxes: Schema.Int,
  fetched: Schema.Int,
  stored: Schema.Int,
  errors: Schema.Array(SyncFailure),
})

type SyncReport = typeof SyncReport.Type

const MessageTarget = Schema.Struct({
  id: MessageId,
  accountId: AccountId,
  mailboxPath: Schema.String,
})

type MessageTarget = typeof MessageTarget.Type

const SearchOutcome = Schema.Struct({
  messages: Schema.Array(MessageListItem),
  hasMore: Schema.Boolean,
})

type SearchOutcome = typeof SearchOutcome.Type

export {
  ActionFailure,
  ListScope,
  MailboxSnapshot,
  Mailbox,
  MailboxCounts,
  MessageBody,
  MessageDetail,
  MessageListItem,
  MessageTarget,
  MoveOutcome,
  SearchOutcome,
  SeenOutcome,
  SyncFailure,
  SyncReport,
}
