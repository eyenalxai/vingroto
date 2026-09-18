import type { SyncConfig } from "@vingroto/core/config/schema"

import { AppPaths } from "@vingroto/core/app-paths"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Schema from "effect/Schema"

import { loadConfigFile } from "@/lib/config/load"
import { saveConfigFile } from "@/lib/config/save"

class SyncSettingsInvalid extends Schema.TaggedError<SyncSettingsInvalid>()("SyncSettingsInvalid", {
  message: Schema.String,
}) {}

const maxInitialDays = 3650
const maxIntervalMinutes = 1440

const makeUpdateSyncSettings = (configPath: string, fs: FileSystem.FileSystem) =>
  Effect.fn("Config.updateSyncSettings")(function* persistSyncSettings(input: SyncConfig) {
    if (
      !Number.isInteger(input.initialDays) ||
      input.initialDays < 1 ||
      input.initialDays > maxInitialDays
    ) {
      yield* Effect.fail(
        new SyncSettingsInvalid({
          message: `initial days must be a whole number between 1 and ${maxInitialDays}`,
        }),
      )
      return
    }
    if (
      !Number.isInteger(input.intervalMinutes) ||
      input.intervalMinutes < 1 ||
      input.intervalMinutes > maxIntervalMinutes
    ) {
      yield* Effect.fail(
        new SyncSettingsInvalid({
          message: `the interval must be a whole number between 1 and ${maxIntervalMinutes} minutes`,
        }),
      )
      return
    }
    const config = yield* loadConfigFile(configPath, fs)
    yield* saveConfigFile(configPath, fs, { ...config, sync: { ...input } })
    yield* Effect.logInfo("sync settings saved").pipe(Effect.annotateLogs({ ...input }))
  })

const updateSyncSettings = (input: SyncConfig) =>
  Effect.all({ paths: AppPaths, fs: FileSystem.FileSystem }).pipe(
    Effect.flatMap(({ paths, fs }) => makeUpdateSyncSettings(paths.config, fs)(input)),
  )

export { SyncSettingsInvalid, makeUpdateSyncSettings, updateSyncSettings }
