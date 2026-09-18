import { describeError } from "@vingroto/core/errors"
import { ServerError, ServerRpcs } from "@vingroto/core/protocol/rpc"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"

import { Accounts } from "@/lib/accounts"
import { ServerEvents } from "@/lib/events"
import { MailActions } from "@/lib/mail/actions"
import { Discovery } from "@/lib/mail/autoconfig"
import { MessageBodies } from "@/lib/mail/bodies"
import { readMailboxSnapshot, updateMailboxMute } from "@/lib/mailboxes"
import { Scheduler } from "@/lib/scheduler"
import { readServerStatus } from "@/lib/status"
import { getMessage, listMessagesForScope } from "@/lib/store/messages"

const toServerError = (error: unknown) => new ServerError({ message: describeError(error) })

const Handlers = ServerRpcs.toLayer({
  status: () => readServerStatus().pipe(Effect.mapError(toServerError)),
  mailboxSnapshot: () => readMailboxSnapshot().pipe(Effect.mapError(toServerError)),
  listMessages: ({ scope, limit }) =>
    listMessagesForScope(scope, limit).pipe(Effect.mapError(toServerError)),
  getMessage: ({ id }) =>
    getMessage(id).pipe(
      Effect.map((message) => message ?? null),
      Effect.mapError(toServerError),
    ),
  loadBody: ({ id }) =>
    MessageBodies.pipe(
      Effect.flatMap((bodies) => bodies.loadById(id)),
      Effect.mapError(toServerError),
    ),
  setSeen: ({ ids, seen }) =>
    MailActions.pipe(
      Effect.flatMap((actions) => actions.setSeenByIds(ids, seen)),
      Effect.mapError(toServerError),
    ),
  moveMessages: ({ ids, targetMailboxId }) =>
    MailActions.pipe(
      Effect.flatMap((actions) => actions.moveByIds(ids, targetMailboxId)),
      Effect.mapError(toServerError),
    ),
  setMailboxMuted: ({ mailboxId, muted }) =>
    updateMailboxMute(mailboxId, muted).pipe(Effect.mapError(toServerError)),
  sync: (payload) =>
    Scheduler.pipe(
      Effect.flatMap((scheduler) => scheduler.request(payload)),
      Effect.mapError(toServerError),
    ),
  discover: ({ email }) => Discovery.pipe(Effect.flatMap((discovery) => discovery.discover(email))),
  createAccount: (input) =>
    Accounts.pipe(
      Effect.flatMap((accounts) => accounts.create(input)),
      Effect.mapError(toServerError),
    ),
  updateAccount: ({ id, input }) =>
    Accounts.pipe(
      Effect.flatMap((accounts) => accounts.update(id, input)),
      Effect.mapError(toServerError),
    ),
  accountUsername: ({ id }) => Accounts.pipe(Effect.flatMap((accounts) => accounts.username(id))),
  saveSyncSettings: (settings) =>
    Accounts.pipe(
      Effect.flatMap((accounts) => accounts.saveSyncSettings(settings)),
      Effect.mapError(toServerError),
    ),
  events: () => Stream.unwrap(ServerEvents.pipe(Effect.map((events) => events.stream))),
})

export { Handlers }
