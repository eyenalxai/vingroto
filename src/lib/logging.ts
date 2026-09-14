import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import path from "node:path"

import { AppPaths } from "@/lib/app-paths"

// The terminal renderer owns stdout: runtime logs go to a file so they cannot corrupt the interface.
const LoggingLayer = Layer.unwrap(
  Effect.gen(function* loggingLayer() {
    const paths = yield* AppPaths
    const logger = yield* Logger.toFile(
      Logger.formatSimple,
      path.join(paths.dataDir, "vingroto.log"),
      {
        flag: "a",
      },
    )
    return Logger.layer([logger])
  }),
)

export { LoggingLayer }
