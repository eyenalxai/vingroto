import * as Schema from "effect/Schema"
import { Rpc, RpcGroup } from "effect/unstable/rpc"

import { AccountConfig, SyncConfig } from "../config/schema"
import { AccountId, MailboxId, MessageId } from "../ids"
import { AccountSave, DiscoveryResult, NewAccount, ServerStatus } from "./accounts"
import { ServerEvent } from "./events"
import {
  ListScope,
  MailboxSnapshot,
  MessageBody,
  MessageDetail,
  MessageListItem,
  MoveOutcome,
  SeenOutcome,
  SyncReport,
} from "./mail"

class ServerError extends Schema.TaggedError<ServerError>()("ServerError", {
  message: Schema.String,
}) {}

const ServerRpcs = RpcGroup.make(
  Rpc.make("status", { success: ServerStatus, error: ServerError }),
  Rpc.make("mailboxSnapshot", { success: MailboxSnapshot, error: ServerError }),
  Rpc.make("listMessages", {
    payload: { scope: ListScope, limit: Schema.Int },
    success: Schema.Array(MessageListItem),
    error: ServerError,
  }),
  Rpc.make("getMessage", {
    payload: { id: MessageId },
    success: Schema.NullOr(MessageDetail),
    error: ServerError,
  }),
  Rpc.make("loadBody", {
    payload: { id: MessageId },
    success: MessageBody,
    error: ServerError,
  }),
  Rpc.make("setSeen", {
    payload: { ids: Schema.Array(MessageId), seen: Schema.Boolean },
    success: SeenOutcome,
    error: ServerError,
  }),
  Rpc.make("moveMessages", {
    payload: { ids: Schema.Array(MessageId), targetMailboxId: MailboxId },
    success: MoveOutcome,
    error: ServerError,
  }),
  Rpc.make("setMailboxMuted", {
    payload: { mailboxId: MailboxId, muted: Schema.Boolean },
    success: Schema.Void,
    error: ServerError,
  }),
  Rpc.make("sync", {
    payload: {
      paths: Schema.optionalKey(Schema.Array(Schema.String)),
      accountId: Schema.optionalKey(AccountId),
    },
    success: Schema.Array(SyncReport),
    error: ServerError,
  }),
  Rpc.make("discover", {
    payload: { email: Schema.String },
    success: DiscoveryResult,
    error: ServerError,
  }),
  Rpc.make("createAccount", {
    payload: NewAccount,
    success: AccountConfig,
    error: ServerError,
  }),
  Rpc.make("updateAccount", {
    payload: { id: AccountId, input: AccountSave },
    success: AccountConfig,
    error: ServerError,
  }),
  Rpc.make("accountUsername", {
    payload: { id: AccountId },
    success: Schema.NullOr(Schema.String),
    error: ServerError,
  }),
  Rpc.make("saveSyncSettings", {
    payload: SyncConfig,
    success: Schema.Void,
    error: ServerError,
  }),
  Rpc.make("events", { success: ServerEvent, error: ServerError, stream: true }),
)

export { ServerError, ServerRpcs }
