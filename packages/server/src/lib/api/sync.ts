import { describeError } from "@vingroto/core/errors"
import { InternalError } from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { ServerApi } from "@/lib/api/api"
import { Scheduler } from "@/lib/scheduler"

const SyncHandlers = HttpApiBuilder.group(ServerApi, "sync", (handlers) =>
  handlers.handle("sync.run", ({ payload }) =>
    Scheduler.pipe(
      Effect.flatMap((scheduler) => scheduler.request(payload)),
      Effect.mapError((error) => new InternalError({ message: describeError(error) })),
    ),
  ),
)

export { SyncHandlers }
