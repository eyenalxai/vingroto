import type { NotificationsConfig } from "@vingroto/core/config/schema"
import type * as FileSystem from "effect/FileSystem"

import * as Effect from "effect/Effect"

import { loadConfigFile } from "@/lib/config/load"
import { saveConfigFile } from "@/lib/config/save"

const makeUpdateNotifications = (configPath: string, fs: FileSystem.FileSystem) =>
  Effect.fn("Config.updateNotifications")(function* persistNotifications(
    input: NotificationsConfig,
  ) {
    const config = yield* loadConfigFile(configPath, fs)
    yield* saveConfigFile(configPath, fs, { ...config, notifications: { ...input } })
    yield* Effect.logInfo("notification settings saved").pipe(Effect.annotateLogs({ ...input }))
  })

export { makeUpdateNotifications }
