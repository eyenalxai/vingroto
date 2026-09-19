import { describeError } from "@vingroto/core/errors"
import { InvalidRequestError } from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { ServerApi } from "@/lib/api/api"
import { internalFailure } from "@/lib/api/internal-error"
import { Scheduler } from "@/lib/scheduler"

const SyncHandlers = HttpApiBuilder.group(ServerApi, "sync", (handlers) =>
  handlers.handle("sync.run", ({ payload }) =>
    Effect.catchTags(
      Scheduler.pipe(Effect.flatMap((scheduler) => scheduler.request(payload))),
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
  ),
)

export { SyncHandlers }
