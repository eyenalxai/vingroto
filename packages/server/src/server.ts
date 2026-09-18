import { BunRuntime, BunServices } from "@effect/platform-bun"
import { AppPaths } from "@vingroto/core/app-paths"
import { LoggingLayer } from "@vingroto/core/logging"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { ServerRuntime } from "@/lib/runtime"

const Bootstrap = LoggingLayer.server.pipe(
  Layer.provideMerge(AppPaths.layer),
  Layer.provideMerge(BunServices.layer),
)

const program = Layer.launch(ServerRuntime).pipe(
  Effect.provide(Bootstrap),
  Effect.catchTag("ServerAlreadyRunning", (error) =>
    Effect.logInfo("another vingroto server is already running").pipe(
      Effect.annotateLogs({ socket: error.socket }),
    ),
  ),
)

BunRuntime.runMain(program)
