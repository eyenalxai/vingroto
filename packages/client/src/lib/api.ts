import type { AccountConfig } from "@vingroto/core/config/schema"
import type {
  AccountSave,
  DiscoveryResult,
  NewAccount,
  ServerStatus,
  SyncSettings,
} from "@vingroto/core/protocol/accounts"
import type { ServerEvent } from "@vingroto/core/protocol/events"
import type {
  FolderScope,
  FolderSnapshot,
  MessageBody,
  MessageDetail,
  MessageListItem,
  MoveOutcome,
  SeenOutcome,
  SyncReport,
} from "@vingroto/core/protocol/mail"
import type { ServerError } from "@vingroto/core/protocol/rpc"
import type { Effect, Stream } from "effect"
import type { RpcClientError } from "effect/unstable/rpc"

import * as Context from "effect/Context"
import * as Schema from "effect/Schema"

class ClientDefect extends Schema.TaggedError<ClientDefect>()("ClientDefect", {
  message: Schema.String,
}) {}

type MailClientError = ServerError | RpcClientError.RpcClientError | ClientDefect

interface SyncRequest {
  readonly paths?: readonly string[]
  readonly accountId?: string
}

interface MailClientShape {
  readonly status: () => Effect.Effect<ServerStatus, MailClientError>
  readonly folderSnapshot: () => Effect.Effect<FolderSnapshot, MailClientError>
  readonly listMessages: (
    scope: FolderScope,
    limit: number,
  ) => Effect.Effect<readonly MessageListItem[], MailClientError>
  readonly getMessage: (id: number) => Effect.Effect<MessageDetail | null, MailClientError>
  readonly loadBody: (id: number) => Effect.Effect<MessageBody, MailClientError>
  readonly setSeen: (
    ids: readonly number[],
    seen: boolean,
  ) => Effect.Effect<SeenOutcome, MailClientError>
  readonly moveMessages: (
    ids: readonly number[],
    targetMailboxId: number,
  ) => Effect.Effect<MoveOutcome, MailClientError>
  readonly setMailboxMuted: (
    mailboxId: number,
    muted: boolean,
  ) => Effect.Effect<void, MailClientError>
  readonly sync: (request: SyncRequest) => Effect.Effect<readonly SyncReport[], MailClientError>
  readonly discover: (email: string) => Effect.Effect<DiscoveryResult, MailClientError>
  readonly createAccount: (input: NewAccount) => Effect.Effect<AccountConfig, MailClientError>
  readonly updateAccount: (
    id: string,
    input: AccountSave,
  ) => Effect.Effect<AccountConfig, MailClientError>
  readonly accountUsername: (id: string) => Effect.Effect<string | null, MailClientError>
  readonly saveSyncSettings: (settings: SyncSettings) => Effect.Effect<void, MailClientError>
  readonly events: Stream.Stream<ServerEvent, MailClientError>
}

class MailClient extends Context.Service<MailClient, MailClientShape>()(
  "vingroto/lib/client/MailClient",
) {}

export { ClientDefect, MailClient, type MailClientError, type MailClientShape, type SyncRequest }
