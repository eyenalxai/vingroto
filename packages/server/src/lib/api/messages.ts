import { describeError } from "@vingroto/core/errors"
import { InvalidRequestError, MessageNotFoundError } from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import * as Predicate from "effect/Predicate"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { ServerApi } from "@/lib/api/api"
import { internalFailure, sanitizeFailure, upstreamFailure } from "@/lib/api/internal-error"
import { limitFromQuery, scopeFromQuery } from "@/lib/api/list-scope"
import { MailActions } from "@/lib/mail/actions"
import { MessageBodies } from "@/lib/mail/bodies"
import { Messages } from "@/lib/messages"

const MessageHandlers = HttpApiBuilder.group(ServerApi, "messages", (handlers) =>
  handlers
    .handle("message.list", ({ query }) =>
      Effect.gen(function* listMessages() {
        const scope = yield* scopeFromQuery(query)
        const limit = yield* limitFromQuery(query)
        return yield* sanitizeFailure(
          Messages.pipe(Effect.flatMap((messages) => messages.list(scope, limit))),
        )
      }),
    )
    .handle("message.get", ({ params }) =>
      sanitizeFailure(
        Messages.pipe(Effect.flatMap((messages) => messages.get(params.messageId))),
      ).pipe(
        Effect.filterOrFail(
          Predicate.isNotUndefined,
          () =>
            new MessageNotFoundError({
              messageId: params.messageId,
              message: `message ${params.messageId} was not found`,
            }),
        ),
      ),
    )
    .handle("message.body", ({ params }) =>
      Effect.catchTags(
        MessageBodies.pipe(Effect.flatMap((bodies) => bodies.loadById(params.messageId))),
        {
          MessageNotFound: (error) =>
            Effect.fail(
              new MessageNotFoundError({ messageId: error.messageId, message: error.message }),
            ),
          ConfigInvalid: (error) =>
            Effect.fail(
              new InvalidRequestError({
                message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
              }),
            ),
          ImapError: upstreamFailure,
          BodyParseError: upstreamFailure,
        },
        internalFailure,
      ),
    )
    .handle("message.setSeen", ({ payload }) =>
      Effect.catchTags(
        MailActions.pipe(
          Effect.flatMap((actions) => actions.setSeenByIds(payload.ids, payload.seen)),
        ),
        {
          ConfigInvalid: (error) =>
            Effect.fail(
              new InvalidRequestError({
                message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
              }),
            ),
          ConfigUnreadable: (error) =>
            Effect.fail(new InvalidRequestError({ message: error.message })),
        },
        internalFailure,
      ),
    )
    .handle("message.move", ({ payload }) =>
      Effect.catchTags(
        Messages.pipe(
          Effect.flatMap((messages) => messages.move(payload.ids, payload.targetMailboxId)),
        ),
        {
          MessageActionError: (error) =>
            Effect.fail(new InvalidRequestError({ message: error.message })),
          ConfigInvalid: (error) =>
            Effect.fail(
              new InvalidRequestError({
                message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
              }),
            ),
          ConfigUnreadable: (error) =>
            Effect.fail(new InvalidRequestError({ message: error.message })),
        },
        internalFailure,
      ),
    ),
)

export { MessageHandlers }
