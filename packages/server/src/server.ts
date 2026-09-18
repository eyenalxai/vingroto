import { BunRuntime, BunServices } from "@effect/platform-bun"
import { AppPaths } from "@vingroto/core/app-paths"
import { LoggingLayer } from "@vingroto/core/logging"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { probeSocket } from "@/lib/lifecycle"
import { ServerRuntime } from "@/lib/runtime"

const Bootstrap = LoggingLayer.pipe(
  Layer.provideMerge(AppPaths.layer),
  Layer.provideMerge(BunServices.layer),
)

const main = Effect.gen(function* runServer() {
  const paths = yield* AppPaths
  if (yield* probeSocket(paths.socket)) {
    yield* Effect.logInfo("another vingroto server is already running").pipe(
      Effect.annotateLogs({ socket: paths.socket }),
    )
    return
  }
  yield* Layer.launch(ServerRuntime)
})

const program = Effect.scoped(main).pipe(
  Effect.provide(Bootstrap),
  Effect.catchTag("ServerAlreadyRunning", (error) =>
    Effect.logInfo("another vingroto server is already running").pipe(
      Effect.annotateLogs({ socket: error.socket }),
    ),
  ),
)

BunRuntime.runMain(program)
