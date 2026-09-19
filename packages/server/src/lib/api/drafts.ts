import { describeError } from "@vingroto/core/errors"
import {
  AccountNotFoundError,
  DraftNotFoundError,
  InternalError,
  InvalidRequestError,
} from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { ServerApi } from "@/lib/api/api"
import { Drafts } from "@/lib/drafts"

const toInternal = (error: unknown) => new InternalError({ message: describeError(error) })

const DraftHandlers = HttpApiBuilder.group(ServerApi, "drafts", (handlers) =>
  handlers
    .handle("draft.save", ({ payload }) =>
      Drafts.pipe(
        Effect.flatMap((drafts) => drafts.save(payload)),
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
      ),
    )
    .handle("draft.list", () =>
      Drafts.pipe(
        Effect.flatMap((drafts) => drafts.list()),
        Effect.mapError(toInternal),
      ),
    )
    .handle("draft.delete", ({ params }) =>
      Drafts.pipe(
        Effect.flatMap((drafts) => drafts.delete(params.draftId)),
        Effect.mapError((error): DraftNotFoundError | InternalError => {
          if (error._tag === "DraftNotFound") {
            return new DraftNotFoundError({ draftId: error.draftId, message: error.message })
          }
          return toInternal(error)
        }),
      ),
    ),
)

export { DraftHandlers }
