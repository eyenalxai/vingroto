import type { EditorConfig } from "@vingroto/core/config/schema"
import type * as FileSystem from "effect/FileSystem"

import * as Effect from "effect/Effect"

import { loadConfigFile } from "@/lib/config/load"
import { saveConfigFile } from "@/lib/config/save"

const makeUpdateEditor = (configPath: string, fs: FileSystem.FileSystem) =>
  Effect.fn("Config.updateEditor")(function* persistEditor(editor: EditorConfig) {
    const config = yield* loadConfigFile(configPath, fs)
    yield* saveConfigFile(configPath, fs, { ...config, editor })
    yield* Effect.logInfo("editor setting saved").pipe(Effect.annotateLogs({ editor }))
  })

export { makeUpdateEditor }
