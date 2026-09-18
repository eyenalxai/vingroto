import type { SyncConfig } from "@vingroto/core/config/schema"

import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { loadConfig } from "@/lib/config/load"
import { saveConfig } from "@/lib/config/save"

class SyncSettingsInvalid extends Schema.TaggedError<SyncSettingsInvalid>()("SyncSettingsInvalid", {
  message: Schema.String,
}) {}

const maxInitialDays = 3650
const maxIntervalMinutes = 1440

const updateSyncSettings = (input: SyncConfig) =>
  Effect.gen(function* persistSyncSettings() {
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
    const config = yield* loadConfig()
    yield* saveConfig({ ...config, sync: { ...input } })
    yield* Effect.logInfo("sync settings saved").pipe(Effect.annotateLogs({ ...input }))
  })

export { SyncSettingsInvalid, updateSyncSettings }
