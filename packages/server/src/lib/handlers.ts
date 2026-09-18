import { describeError } from "@vingroto/core/errors"
import { ServerError, ServerRpcs } from "@vingroto/core/protocol/rpc"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"

import { Accounts } from "@/lib/accounts"
import { ServerEvents } from "@/lib/events"
import { readFolderSnapshot, setFolderMuted } from "@/lib/folders"
import { MailActions } from "@/lib/mail/actions"
import { Discovery } from "@/lib/mail/autoconfig"
import { MessageBodies } from "@/lib/mail/bodies"
import { Scheduler } from "@/lib/scheduler"
import { readServerStatus } from "@/lib/status"
import { getMessage, listMessagesForScope } from "@/lib/store/messages"

const toServerError = (error: unknown) => new ServerError({ message: describeError(error) })

const Handlers = ServerRpcs.toLayer({
  status: () => readServerStatus().pipe(Effect.mapError(toServerError)),
  folderSnapshot: () => readFolderSnapshot().pipe(Effect.mapError(toServerError)),
  listMessages: ({ scope, limit }) =>
    listMessagesForScope(scope, limit).pipe(Effect.mapError(toServerError)),
  getMessage: ({ id }) =>
    getMessage(id).pipe(
      Effect.map((message) => message ?? null),
      Effect.mapError(toServerError),
    ),
  loadBody: ({ id }) =>
    Effect.gen(function* loadMessageBody() {
      const bodies = yield* MessageBodies
      return yield* bodies.loadById(id)
    }).pipe(Effect.mapError(toServerError)),
  setSeen: ({ ids, seen }) =>
    Effect.gen(function* setSeenMessages() {
      const actions = yield* MailActions
      return yield* actions.setSeenByIds(ids, seen)
    }).pipe(Effect.mapError(toServerError)),
  moveMessages: ({ ids, targetMailboxId }) =>
    Effect.gen(function* moveMessages() {
      const actions = yield* MailActions
      return yield* actions.moveByIds(ids, targetMailboxId)
    }).pipe(Effect.mapError(toServerError)),
  setMailboxMuted: ({ mailboxId, muted }) =>
    setFolderMuted(mailboxId, muted).pipe(Effect.mapError(toServerError)),
  sync: (payload) =>
    Effect.gen(function* syncMailboxes() {
      const scheduler = yield* Scheduler
      return yield* scheduler.request(payload)
    }).pipe(Effect.mapError(toServerError)),
  discover: ({ email }) =>
    Effect.gen(function* discoverProvider() {
      const discovery = yield* Discovery
      return yield* discovery.discover(email)
    }),
  createAccount: (input) =>
    Effect.gen(function* createAccount() {
      const accounts = yield* Accounts
      return yield* accounts.create(input)
    }).pipe(Effect.mapError(toServerError)),
  updateAccount: ({ id, input }) =>
    Effect.gen(function* updateConfiguredAccount() {
      const accounts = yield* Accounts
      return yield* accounts.update(id, input)
    }).pipe(Effect.mapError(toServerError)),
  accountUsername: ({ id }) =>
    Effect.gen(function* accountUsername() {
      const accounts = yield* Accounts
      return yield* accounts.username(id)
    }),
  saveSyncSettings: (settings) =>
    Effect.gen(function* persistSyncSettings() {
      const accounts = yield* Accounts
      yield* accounts.saveSyncSettings(settings)
    }).pipe(Effect.mapError(toServerError)),
  events: () => Stream.unwrap(ServerEvents.pipe(Effect.map((events) => events.stream))),
})

export { Handlers }
