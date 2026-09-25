import { describeError } from "@vingroto/core/errors"
import {
  AccountNotFoundError,
  DraftNotFoundError,
  InvalidRequestError,
} from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { ServerApi } from "@/lib/api/api"
import { internalFailure, sanitizeFailure } from "@/lib/api/internal-error"
import { Drafts } from "@/lib/drafts"

const DraftHandlers = HttpApiBuilder.group(ServerApi, "drafts", (handlers) =>
  handlers
    .handle("draft.save", ({ payload }) =>
      Effect.catchTags(
        Drafts.pipe(Effect.flatMap((drafts) => drafts.save(payload))),
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
      ),
    )
    .handle("draft.list", () =>
      sanitizeFailure(Drafts.pipe(Effect.flatMap((drafts) => drafts.list))),
    )
    .handle("draft.delete", ({ params }) =>
      Effect.catchTags(
        Drafts.pipe(Effect.flatMap((drafts) => drafts.delete(params.draftId))),
        {
          DraftNotFound: (error) =>
            Effect.fail(new DraftNotFoundError({ draftId: error.draftId, message: error.message })),
        },
        internalFailure,
      ),
    ),
)

export { DraftHandlers }
