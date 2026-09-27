import type { AppConfig } from "@vingroto/core/config/schema"
import type { PlatformError } from "effect/PlatformError"

import { AppPaths } from "@vingroto/core/app-paths"
import {
  AppConfigFile,
  defaultEditor,
  defaultNotifications,
  defaultSend,
  syncDefaults,
} from "@vingroto/core/config/schema"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Schema from "effect/Schema"

const emptyConfig = (): AppConfig => ({
  accounts: [],
  sync: syncDefaults(),
  notifications: defaultNotifications(),
  send: defaultSend(),
  editor: defaultEditor(),
})

class ConfigInvalid extends Schema.TaggedError<ConfigInvalid>()("ConfigInvalid", {
  path: Schema.String,
  cause: Schema.Defect(),
}) {}

class ConfigUnreadable extends Schema.TaggedError<ConfigUnreadable>()("ConfigUnreadable", {
  path: Schema.String,
  message: Schema.String,
}) {}

const observedFiles = new Map<string, string | null>()

// Why: loadConfigFile runs on every scheduler tick, request and watch poll, so the state log fires only when a read observes the file appearing, changing or disappearing.
const fileStateChanged = (configPath: string, content: string | null): boolean => {
  const changed = !observedFiles.has(configPath) || observedFiles.get(configPath) !== content
  observedFiles.set(configPath, content)
  return changed
}

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
    if (fileStateChanged(configPath, null)) {
      yield* Effect.logInfo("no configuration file yet, starting with an empty configuration").pipe(
        Effect.annotateLogs({ path: configPath }),
      )
    }
    return emptyConfig()
  }
  const raw = yield* fs
    .readFileString(configPath)
    .pipe(Effect.catchTag("PlatformError", (error) => Effect.fail(unreadable(error))))
  const config = yield* Schema.decodeEffect(Schema.fromJsonString(AppConfigFile))(raw).pipe(
    Effect.mapError((cause) => new ConfigInvalid({ path: configPath, cause })),
  )
  if (fileStateChanged(configPath, raw)) {
    yield* Effect.logInfo("configuration loaded").pipe(
      Effect.annotateLogs({ accounts: config.accounts.length, path: configPath }),
    )
  }
  return config
})

const loadConfig = Effect.fn("Config.load")(function* load() {
  const paths = yield* AppPaths
  const fs = yield* FileSystem.FileSystem
  return yield* loadConfigFile(paths.config, fs)
})

export { ConfigInvalid, ConfigUnreadable, loadConfig, loadConfigFile }
