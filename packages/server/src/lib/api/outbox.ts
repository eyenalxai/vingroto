import { describeError } from "@vingroto/core/errors"
import {
  AccountNotFoundError,
  InternalError,
  InvalidRequestError,
  OutboxNotFoundError,
} from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { ServerApi } from "@/lib/api/api"
import { Outbox } from "@/lib/outbox"

const toInternal = (error: unknown) => new InternalError({ message: describeError(error) })

const OutboxHandlers = HttpApiBuilder.group(ServerApi, "outbox", (handlers) =>
  handlers
    .handle("outbox.enqueue", ({ payload }) => {
      if (payload.to.length === 0) {
        return Effect.fail(
          new InvalidRequestError({
            field: "body.to",
            message: "a message needs at least one recipient",
          }),
        )
      }
      return Outbox.pipe(
        Effect.flatMap((outbox) => outbox.enqueue(payload)),
        Effect.mapError((error): AccountNotFoundError | InvalidRequestError | InternalError => {
          if (error._tag === "AccountNotConfigured") {
            return new AccountNotFoundError({
              accountId: error.accountId,
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
      )
    })
    .handle("outbox.list", () =>
      Outbox.pipe(
        Effect.flatMap((outbox) => outbox.list()),
        Effect.mapError(toInternal),
      ),
    )
    .handle("outbox.cancel", ({ params }) =>
      Outbox.pipe(
        Effect.flatMap((outbox) => outbox.cancel(params.outboxId)),
        Effect.mapError((error): OutboxNotFoundError | InternalError => {
          if (error._tag === "OutboxNotFound") {
            return new OutboxNotFoundError({
              outboxId: error.outboxId,
              message: error.message,
            })
          }
          return toInternal(error)
        }),
      ),
    )
    .handle("outbox.release", ({ params }) =>
      Outbox.pipe(
        Effect.flatMap((outbox) => outbox.release(params.outboxId)),
        Effect.mapError((error): OutboxNotFoundError | InternalError => {
          if (error._tag === "OutboxNotFound") {
            return new OutboxNotFoundError({
              outboxId: error.outboxId,
              message: error.message,
            })
          }
          return toInternal(error)
        }),
      ),
    ),
)

export { OutboxHandlers }
