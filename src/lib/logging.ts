import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import * as References from "effect/References"
import path from "node:path"

import { AppPaths } from "@/lib/app-paths"

const levels = ["All", "Fatal", "Error", "Warn", "Info", "Debug", "Trace", "None"] as const

// The terminal renderer owns stdout: runtime logs go to a file so they cannot corrupt the interface.
const LoggingLayer = Layer.unwrap(
  Effect.gen(function* loggingLayer() {
    const paths = yield* AppPaths
    const level = yield* Config.Literals(levels, "VINGROTO_LOG_LEVEL").pipe(
      Config.withDefault("Info"),
    )
    const logger = yield* Logger.toFile(
      Logger.formatSimple,
      path.join(paths.dataDir, "vingroto.log"),
      {
        flag: "a",
      },
    )
    return Layer.merge(Logger.layer([logger]), Layer.succeed(References.MinimumLogLevel, level))
  }),
)

export { LoggingLayer }
