import * as Schema from "effect/Schema"
import { Rpc, RpcGroup } from "effect/unstable/rpc"

import { AccountConfig } from "../config/schema"
import { AccountSave, DiscoveryResult, NewAccount, ServerStatus, SyncSettings } from "./accounts"
import { ServerEvent } from "./events"
import {
  FolderScope,
  FolderSnapshot,
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
  Rpc.make("folderSnapshot", { success: FolderSnapshot, error: ServerError }),
  Rpc.make("listMessages", {
    payload: { scope: FolderScope, limit: Schema.Int },
    success: Schema.Array(MessageListItem),
    error: ServerError,
  }),
  Rpc.make("getMessage", {
    payload: { id: Schema.Int },
    success: Schema.NullOr(MessageDetail),
    error: ServerError,
  }),
  Rpc.make("loadBody", {
    payload: { id: Schema.Int },
    success: MessageBody,
    error: ServerError,
  }),
  Rpc.make("setSeen", {
    payload: { ids: Schema.Array(Schema.Int), seen: Schema.Boolean },
    success: SeenOutcome,
    error: ServerError,
  }),
  Rpc.make("moveMessages", {
    payload: { ids: Schema.Array(Schema.Int), targetMailboxId: Schema.Int },
    success: MoveOutcome,
    error: ServerError,
  }),
  Rpc.make("setMailboxMuted", {
    payload: { mailboxId: Schema.Int, muted: Schema.Boolean },
    success: Schema.Void,
    error: ServerError,
  }),
  Rpc.make("sync", {
    payload: {
      paths: Schema.optionalKey(Schema.Array(Schema.String)),
      accountId: Schema.optionalKey(Schema.String),
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
    payload: { id: Schema.String, input: AccountSave },
    success: AccountConfig,
    error: ServerError,
  }),
  Rpc.make("accountUsername", {
    payload: { id: Schema.String },
    success: Schema.NullOr(Schema.String),
    error: ServerError,
  }),
  Rpc.make("saveSyncSettings", {
    payload: SyncSettings,
    success: Schema.Void,
    error: ServerError,
  }),
  Rpc.make("events", { success: ServerEvent, error: ServerError, stream: true }),
)

export { ServerError, ServerRpcs }
