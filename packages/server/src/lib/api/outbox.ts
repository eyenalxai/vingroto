import { describeError } from "@vingroto/core/errors"
import {
  AccountNotFoundError,
  InvalidRequestError,
  OutboxNotFoundError,
} from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { ServerApi } from "@/lib/api/api"
import { internalFailure, sanitizeFailure } from "@/lib/api/internal-error"
import { invalidField } from "@/lib/api/invalid-request"
import { Outbox } from "@/lib/outbox"

const OutboxHandlers = HttpApiBuilder.group(ServerApi, "outbox", (handlers) =>
  handlers
    .handle("outbox.enqueue", ({ payload }) => {
      if (payload.to.length === 0) {
        return Effect.fail(invalidField("Body", "to", "a message needs at least one recipient"))
      }
      return Effect.catchTags(
        Outbox.pipe(Effect.flatMap((outbox) => outbox.enqueue(payload))),
        {
          AccountNotConfigured: (error) =>
            Effect.fail(
              new AccountNotFoundError({ accountId: error.accountId, message: error.message }),
            ),
          ConfigInvalid: (error) =>
            Effect.fail(
              new InvalidRequestError({
                message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
              }),
            ),
        },
        internalFailure,
      )
    })
    .handle("outbox.list", () =>
      sanitizeFailure(Outbox.pipe(Effect.flatMap((outbox) => outbox.list))),
    )
    .handle("outbox.cancel", ({ params }) =>
      Effect.catchTags(
        Outbox.pipe(Effect.flatMap((outbox) => outbox.cancel(params.outboxId))),
        {
          OutboxNotFound: (error) =>
            Effect.fail(
              new OutboxNotFoundError({ outboxId: error.outboxId, message: error.message }),
            ),
        },
        internalFailure,
      ),
    )
    .handle("outbox.release", ({ params }) =>
      Effect.catchTags(
        Outbox.pipe(Effect.flatMap((outbox) => outbox.release(params.outboxId))),
        {
          OutboxNotFound: (error) =>
            Effect.fail(
              new OutboxNotFoundError({ outboxId: error.outboxId, message: error.message }),
            ),
        },
        internalFailure,
      ),
    ),
)

export { OutboxHandlers }
