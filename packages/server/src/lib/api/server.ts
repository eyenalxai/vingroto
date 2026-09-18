import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { ServerApi } from "@/lib/api/api"
import { readServerStatus } from "@/lib/status"

const ServerHandlers = HttpApiBuilder.group(ServerApi, "server", (handlers) =>
  handlers
    .handle("server.health", () => Effect.succeed({ healthy: true as const }))
    .handle("server.status", () => readServerStatus().pipe(Effect.orDie)),
)

export { ServerHandlers }
