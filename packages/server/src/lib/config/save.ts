import type { AppConfig } from "@vingroto/core/config/schema"
import type { PlatformError } from "effect/PlatformError"

import { AppPaths } from "@vingroto/core/app-paths"
import { AppConfigFile } from "@vingroto/core/config/schema"
import { describeError } from "@vingroto/core/errors"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Schema from "effect/Schema"

class ConfigWriteError extends Schema.TaggedError<ConfigWriteError>()("ConfigWriteError", {
  path: Schema.String,
  message: Schema.String,
}) {}

const saveConfigFile = Effect.fnUntraced(function* saveFile(
  configPath: string,
  fs: FileSystem.FileSystem,
  config: AppConfig,
): Effect.fn.Return<void, ConfigWriteError> {
  const file: AppConfigFile = {
    accounts: [...config.accounts],
    sync: config.sync,
    notifications: config.notifications,
    send: config.send,
    editor: config.editor,
  }
  const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(AppConfigFile, { space: 2 }))(
    file,
  ).pipe(
    Effect.mapError(
      (error) => new ConfigWriteError({ path: configPath, message: describeError(error) }),
    ),
  )
  const temporary = `${configPath}.tmp`
  const writeError = (error: PlatformError) =>
    new ConfigWriteError({ path: configPath, message: error.message })
  yield* fs
    .writeFileString(temporary, `${encoded}\n`)
    .pipe(Effect.catchTag("PlatformError", (error) => Effect.fail(writeError(error))))
  yield* fs
    .rename(temporary, configPath)
    .pipe(Effect.catchTag("PlatformError", (error) => Effect.fail(writeError(error))))
  yield* Effect.logInfo("configuration saved").pipe(
    Effect.annotateLogs({ path: configPath, accounts: config.accounts.length }),
  )
})

const saveConfig = Effect.fn("Config.save")(function* save(config: AppConfig) {
  const paths = yield* AppPaths
  const fs = yield* FileSystem.FileSystem
  return yield* saveConfigFile(paths.config, fs, config)
})

export { ConfigWriteError, saveConfig, saveConfigFile }
