import { BunRuntime } from "@effect/platform-bun"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { ServerRuntime } from "@/lib/runtime"

const program = Layer.launch(ServerRuntime).pipe(
  Effect.catchTag("ServerAlreadyRunning", (error) =>
    Effect.logInfo("another vingroto server is already running").pipe(
      Effect.annotateLogs({ lock: error.lock, message: error.message }),
    ),
  ),
)

BunRuntime.runMain(program)
