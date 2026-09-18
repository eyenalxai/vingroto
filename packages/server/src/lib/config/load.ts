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

const loadConfig = Effect.fn("Config.load")(function* load() {
  const paths = yield* AppPaths
  const fs = yield* FileSystem.FileSystem
  const unreadable = (error: PlatformError) =>
    new ConfigUnreadable({ path: paths.config, message: error.message })
  const exists = yield* fs
    .exists(paths.config)
    .pipe(Effect.catchTag("PlatformError", (error) => Effect.fail(unreadable(error))))
  if (!exists) {
    yield* Effect.logInfo("no configuration file yet, starting with an empty configuration").pipe(
      Effect.annotateLogs({ path: paths.config }),
    )
    return emptyConfig
  }
  const raw = yield* fs
    .readFileString(paths.config)
    .pipe(Effect.catchTag("PlatformError", (error) => Effect.fail(unreadable(error))))
  const decoded = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(AppConfigFile))(raw).pipe(
    Effect.mapError((cause) => new ConfigInvalid({ path: paths.config, cause })),
  )
  const config: AppConfig = { accounts: decoded.accounts, sync: decoded.sync ?? defaultSync }
  yield* Effect.logInfo("configuration loaded").pipe(
    Effect.annotateLogs({ accounts: config.accounts.length, path: paths.config }),
  )
  return config
})

export { ConfigInvalid, ConfigUnreadable, loadConfig }
