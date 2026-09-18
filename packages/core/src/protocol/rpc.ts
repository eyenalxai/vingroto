import * as Schema from "effect/Schema"
import { Rpc, RpcGroup } from "effect/unstable/rpc"

import { AccountConfig } from "../config/schema"
import {
  AccountSaveSchema,
  DiscoveryResultSchema,
  NewAccountSchema,
  ServerStatusSchema,
  SyncSettingsSchema,
} from "./accounts"
import { ServerEventSchema } from "./events"
import {
  FolderScopeSchema,
  FolderSnapshotSchema,
  MessageBodySchema,
  MessageDetailSchema,
  MessageListItemSchema,
  MoveOutcomeSchema,
  SeenOutcomeSchema,
  SyncReportSchema,
} from "./mail"

class ServerError extends Schema.TaggedError<ServerError>()("ServerError", {
  message: Schema.String,
}) {}

const ServerRpcs = RpcGroup.make(
  Rpc.make("status", { success: ServerStatusSchema, error: ServerError }),
  Rpc.make("folderSnapshot", { success: FolderSnapshotSchema, error: ServerError }),
  Rpc.make("listMessages", {
    payload: { scope: FolderScopeSchema, limit: Schema.Int },
    success: Schema.Array(MessageListItemSchema),
    error: ServerError,
  }),
  Rpc.make("getMessage", {
    payload: { id: Schema.Int },
    success: Schema.NullOr(MessageDetailSchema),
    error: ServerError,
  }),
  Rpc.make("loadBody", {
    payload: { id: Schema.Int },
    success: MessageBodySchema,
    error: ServerError,
  }),
  Rpc.make("setSeen", {
    payload: { ids: Schema.Array(Schema.Int), seen: Schema.Boolean },
    success: SeenOutcomeSchema,
    error: ServerError,
  }),
  Rpc.make("moveMessages", {
    payload: { ids: Schema.Array(Schema.Int), targetMailboxId: Schema.Int },
    success: MoveOutcomeSchema,
    error: ServerError,
  }),
  Rpc.make("setMailboxMuted", {
    payload: { mailboxId: Schema.Int, muted: Schema.Boolean },
    success: Schema.Void,
    error: ServerError,
  }),
  Rpc.make("sync", {
    payload: {
      paths: Schema.optional(Schema.Array(Schema.String)),
      accountId: Schema.optional(Schema.String),
    },
    success: Schema.Array(SyncReportSchema),
    error: ServerError,
  }),
  Rpc.make("discover", {
    payload: { email: Schema.String },
    success: DiscoveryResultSchema,
    error: ServerError,
  }),
  Rpc.make("createAccount", {
    payload: NewAccountSchema,
    success: AccountConfig,
    error: ServerError,
  }),
  Rpc.make("updateAccount", {
    payload: { id: Schema.String, input: AccountSaveSchema },
    success: AccountConfig,
    error: ServerError,
  }),
  Rpc.make("accountUsername", {
    payload: { id: Schema.String },
    success: Schema.NullOr(Schema.String),
    error: ServerError,
  }),
  Rpc.make("saveSyncSettings", {
    payload: SyncSettingsSchema,
    success: Schema.Void,
    error: ServerError,
  }),
  Rpc.make("events", { success: ServerEventSchema, error: ServerError, stream: true }),
)

export { ServerError, ServerRpcs }
