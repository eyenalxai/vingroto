import type { AppConfig, SyncConfig } from "@vingroto/core/config/schema"
import type { PlatformError } from "effect/PlatformError"

import { AppPaths } from "@vingroto/core/app-paths"
import { AppConfigFile } from "@vingroto/core/config/schema"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Schema from "effect/Schema"

const defaultSync: SyncConfig = { initialDays: 30, intervalMinutes: 5 }

const emptyConfig: AppConfig = { accounts: [], sync: defaultSync }

class ConfigInvalid extends Schema.TaggedError<ConfigInvalid>()("ConfigInvalid", {
  path: Schema.String,
  cause: Schema.Defect(),
}) {}

class ConfigUnreadable extends Schema.TaggedError<ConfigUnreadable>()("ConfigUnreadable", {
  path: Schema.String,
  message: Schema.String,
}) {}

const loadConfigFile = Effect.fnUntraced(function* loadFile(
  configPath: string,
  fs: FileSystem.FileSystem,
): Effect.fn.Return<AppConfig, ConfigInvalid | ConfigUnreadable> {
  const unreadable = (error: PlatformError) =>
    new ConfigUnreadable({ path: configPath, message: error.message })
  const exists = yield* fs
    .exists(configPath)
    .pipe(Effect.catchTag("PlatformError", (error) => Effect.fail(unreadable(error))))
  if (!exists) {
    yield* Effect.logInfo("no configuration file yet, starting with an empty configuration").pipe(
      Effect.annotateLogs({ path: configPath }),
    )
    return emptyConfig
  }
  const raw = yield* fs
    .readFileString(configPath)
    .pipe(Effect.catchTag("PlatformError", (error) => Effect.fail(unreadable(error))))
  const decoded = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(AppConfigFile))(raw).pipe(
    Effect.mapError((cause) => new ConfigInvalid({ path: configPath, cause })),
  )
  const config: AppConfig = { accounts: decoded.accounts, sync: decoded.sync ?? defaultSync }
  yield* Effect.logInfo("configuration loaded").pipe(
    Effect.annotateLogs({ accounts: config.accounts.length, path: configPath }),
  )
  return config
})

const loadConfig = Effect.fn("Config.load")(function* load() {
  const paths = yield* AppPaths
  const fs = yield* FileSystem.FileSystem
  return yield* loadConfigFile(paths.config, fs)
})

export { ConfigInvalid, ConfigUnreadable, loadConfig, loadConfigFile }
