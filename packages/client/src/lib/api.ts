import type {
  AccountConfig,
  EditorConfig,
  NotificationsConfig,
  SendConfig,
  SyncConfig,
} from "@vingroto/core/config/schema"
import type { AccountId, DraftId, MailboxId, MessageId, OutboxId } from "@vingroto/core/ids"
import type {
  AccountSave,
  DiscoveryResult,
  NewAccount,
  ServerStatus,
} from "@vingroto/core/protocol/accounts"
import type {
  AccountNotFoundError,
  CredentialsError,
  DraftNotFoundError,
  InternalError,
  InvalidRequestError,
  MailboxNotFoundError,
  MessageNotFoundError,
  OutboxNotFoundError,
  UnauthorizedError,
  UpstreamError,
} from "@vingroto/core/protocol/api/errors"
import type { ServerEvent } from "@vingroto/core/protocol/events"
import type {
  ListScope,
  MailboxSnapshot,
  MessageBody,
  MessageDetail,
  MessageListItem,
  MessageTarget,
  MoveOutcome,
  SearchOutcome,
  SeenOutcome,
  SyncReport,
} from "@vingroto/core/protocol/mail"
import type {
  Draft,
  DraftSave,
  OutgoingMessage,
  OutboxEntry,
} from "@vingroto/core/protocol/outgoing"
import type { Effect, Stream } from "effect"
import type { HttpClientError } from "effect/unstable/http"

import * as Context from "effect/Context"
import * as Schema from "effect/Schema"

import type { DaemonError } from "@/lib/daemon"

class ClientDefect extends Schema.TaggedError<ClientDefect>()("ClientDefect", {
  message: Schema.String,
}) {}

type ContractError =
  | AccountNotFoundError
  | CredentialsError
  | DraftNotFoundError
  | InternalError
  | InvalidRequestError
  | MailboxNotFoundError
  | MessageNotFoundError
  | OutboxNotFoundError
  | UnauthorizedError
  | UpstreamError

type MailClientError = ContractError | HttpClientError.HttpClientError | ClientDefect | DaemonError

interface SyncRequest {
  readonly paths?: readonly string[]
  readonly accountId?: AccountId
}

interface MailClientShape {
  readonly status: () => Effect.Effect<ServerStatus, MailClientError>
  readonly mailboxSnapshot: () => Effect.Effect<MailboxSnapshot, MailClientError>
  readonly listMessages: (
    scope: ListScope,
    limit: number,
  ) => Effect.Effect<readonly MessageListItem[], MailClientError>
  readonly getMessage: (id: MessageId) => Effect.Effect<MessageDetail | null, MailClientError>
  readonly loadBody: (id: MessageId) => Effect.Effect<MessageBody, MailClientError>
  readonly setSeen: (
    ids: readonly MessageId[],
    seen: boolean,
  ) => Effect.Effect<SeenOutcome, MailClientError>
  readonly moveMessages: (
    ids: readonly MessageId[],
    targetMailboxId: MailboxId,
  ) => Effect.Effect<MoveOutcome, MailClientError>
  readonly searchMessages: (
    scope: ListScope,
    query: string,
    limit: number,
  ) => Effect.Effect<SearchOutcome, MailClientError>
  readonly searchMarks: (
    scope: ListScope,
    query: string,
  ) => Effect.Effect<readonly MessageTarget[], MailClientError>
  readonly startSearch: (scope: ListScope, query: string) => Effect.Effect<void, MailClientError>
  readonly setMailboxMuted: (
    mailboxId: MailboxId,
    muted: boolean,
  ) => Effect.Effect<void, MailClientError>
  readonly sync: (request: SyncRequest) => Effect.Effect<readonly SyncReport[], MailClientError>
  readonly discover: (email: string) => Effect.Effect<DiscoveryResult, MailClientError>
  readonly createAccount: (input: NewAccount) => Effect.Effect<AccountConfig, MailClientError>
  readonly updateAccount: (
    id: AccountId,
    input: AccountSave,
  ) => Effect.Effect<AccountConfig, MailClientError>
  readonly accountUsername: (id: AccountId) => Effect.Effect<string | null, MailClientError>
  readonly reorderAccounts: (
    accountIds: readonly AccountId[],
  ) => Effect.Effect<void, MailClientError>
  readonly saveSyncSettings: (settings: SyncConfig) => Effect.Effect<void, MailClientError>
  readonly saveNotifications: (
    settings: NotificationsConfig,
  ) => Effect.Effect<void, MailClientError>
  readonly saveSendSettings: (settings: SendConfig) => Effect.Effect<void, MailClientError>
  readonly saveEditorSettings: (settings: EditorConfig) => Effect.Effect<void, MailClientError>
  readonly enqueueMessage: (
    message: OutgoingMessage & { readonly draftId?: DraftId },
  ) => Effect.Effect<OutboxEntry, MailClientError>
  readonly listOutbox: () => Effect.Effect<readonly OutboxEntry[], MailClientError>
  readonly cancelOutbox: (outboxId: OutboxId) => Effect.Effect<void, MailClientError>
  readonly releaseOutbox: (outboxId: OutboxId) => Effect.Effect<OutboxEntry, MailClientError>
  readonly listDrafts: () => Effect.Effect<readonly Draft[], MailClientError>
  readonly saveDraft: (draft: DraftSave) => Effect.Effect<Draft, MailClientError>
  readonly deleteDraft: (draftId: DraftId) => Effect.Effect<void, MailClientError>
  readonly events: Stream.Stream<ServerEvent, MailClientError>
}

class MailClient extends Context.Service<MailClient, MailClientShape>()(
  "vingroto/lib/client/MailClient",
) {}

export { ClientDefect, MailClient, type MailClientError, type MailClientShape, type SyncRequest }
