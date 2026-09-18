import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import * as References from "effect/References"
import path from "node:path"

import { AppPaths } from "./app-paths"

const levels = ["All", "Fatal", "Error", "Warn", "Info", "Debug", "Trace", "None"] as const

type LoggingRole = "client" | "server"

// The terminal renderer owns stdout, so the client logs to a file only.
// The server also mirrors logs to stderr so journald captures them.
const makeLoggingLayer = (role: LoggingRole) =>
  Layer.unwrap(
    Effect.gen(function* loggingLayer() {
      const paths = yield* AppPaths
      const level = yield* Config.Literals(levels, "VINGROTO_LOG_LEVEL").pipe(
        Config.withDefault("Info"),
      )
      const file = yield* Logger.toFile(
        Logger.formatJson,
        path.join(paths.logsDir, `${role}.log`),
        {
          flag: "a",
        },
      )
      const loggers: readonly Logger.Logger<unknown, void>[] =
        role === "server" ? [Logger.withConsoleError(Logger.formatSimple), file] : [file]
      return Layer.merge(Logger.layer(loggers), Layer.succeed(References.MinimumLogLevel, level))
    }),
  )

const LoggingLayer = {
  client: makeLoggingLayer("client"),
  server: makeLoggingLayer("server"),
}

export { LoggingLayer }
