import type { SendConfig } from "@vingroto/core/config/schema"
import type * as FileSystem from "effect/FileSystem"

import * as Effect from "effect/Effect"

import { loadConfigFile } from "@/lib/config/load"
import { saveConfigFile } from "@/lib/config/save"

const makeUpdateSendSettings = (configPath: string, fs: FileSystem.FileSystem) =>
  Effect.fn("Config.updateSendSettings")(function* persistSendSettings(input: SendConfig) {
    const config = yield* loadConfigFile(configPath, fs)
    yield* saveConfigFile(configPath, fs, { ...config, send: { ...input } })
    yield* Effect.logInfo("send settings saved").pipe(Effect.annotateLogs({ ...input }))
  })

export { makeUpdateSendSettings }
