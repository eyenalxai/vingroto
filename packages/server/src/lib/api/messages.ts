import type { AccountId, MailboxId } from "@vingroto/core/ids"
import type { ListScope } from "@vingroto/core/protocol/mail"

import { describeError } from "@vingroto/core/errors"
import {
  InternalError,
  InvalidRequestError,
  MailboxNotFoundError,
  MessageNotFoundError,
} from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { ServerApi } from "@/lib/api/api"
import { MailActions } from "@/lib/mail/actions"
import { MessageBodies } from "@/lib/mail/bodies"
import { getMailbox } from "@/lib/store/mailboxes"
import { getMessage, listMessagesForScope } from "@/lib/store/messages"

interface MessageListQuery {
  readonly scope: "all" | "unread" | "mailbox"
  readonly accountId?: AccountId | undefined
  readonly mailboxId?: MailboxId | undefined
  readonly limit: number
}

const toInternal = (error: unknown) => new InternalError({ message: describeError(error) })

const scopeFromQuery = (query: MessageListQuery): Effect.Effect<ListScope, InvalidRequestError> => {
  if (query.scope === "mailbox") {
    if (query.mailboxId === undefined) {
      return Effect.fail(
        new InvalidRequestError({
          field: "mailboxId",
          message: "mailboxId is required when the scope is mailbox",
        }),
      )
    }
    return Effect.succeed({ kind: "mailbox", mailboxId: query.mailboxId })
  }
  if (query.mailboxId !== undefined) {
    return Effect.fail(
      new InvalidRequestError({
        field: "mailboxId",
        message: "mailboxId is only valid when the scope is mailbox",
      }),
    )
  }
  if (query.scope === "unread") {
    return Effect.succeed(
      query.accountId === undefined
        ? { kind: "unread" }
        : { kind: "unread", accountId: query.accountId },
    )
  }
  if (query.accountId !== undefined) {
    return Effect.fail(
      new InvalidRequestError({
        field: "accountId",
        message: "accountId is only valid when the scope is unread",
      }),
    )
  }
  return Effect.succeed({ kind: "all" })
}

const MessageHandlers = HttpApiBuilder.group(ServerApi, "messages", (handlers) =>
  handlers
    .handle("message.list", ({ query }) =>
      Effect.gen(function* listMessages() {
        const scope = yield* scopeFromQuery(query)
        return yield* listMessagesForScope(scope, query.limit).pipe(Effect.mapError(toInternal))
      }),
    )
    .handle("message.get", ({ params }) =>
      getMessage(params.messageId).pipe(
        Effect.mapError(toInternal),
        Effect.flatMap((message) =>
          message === undefined
            ? Effect.fail(
                new MessageNotFoundError({
                  messageId: params.messageId,
                  message: `message ${params.messageId} was not found`,
                }),
              )
            : Effect.succeed(message),
        ),
      ),
    )
    .handle("message.body", ({ params }) =>
      MessageBodies.pipe(
        Effect.flatMap((bodies) => bodies.loadById(params.messageId)),
        Effect.mapError((error): MessageNotFoundError | InvalidRequestError | InternalError => {
          if (error._tag === "MessageNotFound") {
            return new MessageNotFoundError({
              messageId: error.messageId,
              message: error.message,
            })
          }
          if (error._tag === "ConfigInvalid") {
            return new InvalidRequestError({
              message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
            })
          }
          return toInternal(error)
        }),
      ),
    )
    .handle("message.setSeen", ({ payload }) =>
      MailActions.pipe(
        Effect.flatMap((actions) => actions.setSeenByIds(payload.ids, payload.seen)),
        Effect.mapError(toInternal),
      ),
    )
    .handle("message.move", ({ payload }) =>
      Effect.gen(function* moveMessages() {
        const target = yield* getMailbox(payload.targetMailboxId).pipe(Effect.mapError(toInternal))
        if (target === undefined) {
          return yield* new MailboxNotFoundError({
            mailboxId: payload.targetMailboxId,
            message: `mailbox ${payload.targetMailboxId} was not found`,
          })
        }
        return yield* MailActions.pipe(
          Effect.flatMap((actions) => actions.moveByIds(payload.ids, payload.targetMailboxId)),
          Effect.mapError((error): InvalidRequestError | InternalError =>
            error._tag === "MessageActionError"
              ? new InvalidRequestError({ message: error.message })
              : toInternal(error),
          ),
        )
      }),
    ),
)

export { MessageHandlers }
