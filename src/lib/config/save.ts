import type { PlatformError } from "effect/PlatformError"

import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Schema from "effect/Schema"

import type { AppConfig } from "@/lib/config/schema"

import { AppPaths } from "@/lib/app-paths"
import { AppConfigFile } from "@/lib/config/schema"
import { describeError } from "@/lib/errors"

class ConfigWriteError extends Schema.TaggedError<ConfigWriteError>()("ConfigWriteError", {
  path: Schema.String,
  message: Schema.String,
}) {}

const saveConfig = Effect.fn("Config.save")(function* save(config: AppConfig) {
  const paths = yield* AppPaths
  const fs = yield* FileSystem.FileSystem
  const file = new AppConfigFile({ accounts: [...config.accounts], sync: config.sync })
  const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(AppConfigFile, { space: 2 }))(
    file,
  ).pipe(
    Effect.mapError(
      (error) => new ConfigWriteError({ path: paths.config, message: describeError(error) }),
    ),
  )
  const temporary = `${paths.config}.tmp`
  const writeError = (error: PlatformError) =>
    new ConfigWriteError({ path: paths.config, message: error.message })
  yield* fs
    .writeFileString(temporary, `${encoded}\n`)
    .pipe(Effect.catchTag("PlatformError", (error) => Effect.fail(writeError(error))))
  yield* fs
    .rename(temporary, paths.config)
    .pipe(Effect.catchTag("PlatformError", (error) => Effect.fail(writeError(error))))
  yield* Effect.logInfo("configuration saved").pipe(
    Effect.annotateLogs({ path: paths.config, accounts: config.accounts.length }),
  )
})

export { ConfigWriteError, saveConfig }
