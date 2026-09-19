import type { SyncConfig } from "@vingroto/core/config/schema"
import type * as FileSystem from "effect/FileSystem"

import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { loadConfigFile } from "@/lib/config/load"
import { saveConfigFile } from "@/lib/config/save"

class SyncSettingsInvalid extends Schema.TaggedError<SyncSettingsInvalid>()("SyncSettingsInvalid", {
  message: Schema.String,
}) {}

const makeUpdateSyncSettings = (configPath: string, fs: FileSystem.FileSystem) =>
  Effect.fn("Config.updateSyncSettings")(function* persistSyncSettings(input: SyncConfig) {
    const config = yield* loadConfigFile(configPath, fs)
    yield* saveConfigFile(configPath, fs, { ...config, sync: { ...input } })
    yield* Effect.logInfo("sync settings saved").pipe(Effect.annotateLogs({ ...input }))
  })

export { SyncSettingsInvalid, makeUpdateSyncSettings }
