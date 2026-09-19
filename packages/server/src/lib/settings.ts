import type { NotificationsConfig, SyncConfig } from "@vingroto/core/config/schema"

import { AppPaths } from "@vingroto/core/app-paths"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"

import type { ConfigInvalid, ConfigUnreadable } from "@/lib/config/load"
import type { ConfigWriteError } from "@/lib/config/save"
import type { SyncSettingsInvalid } from "@/lib/config/sync"

import { makeUpdateNotifications } from "@/lib/config/notifications"
import { makeUpdateSyncSettings } from "@/lib/config/sync"
import { ServerEvents } from "@/lib/events"

interface SettingsShape {
  readonly saveSyncSettings: (
    settings: SyncConfig,
  ) => Effect.Effect<
    void,
    ConfigInvalid | ConfigUnreadable | ConfigWriteError | SyncSettingsInvalid
  >
  readonly saveNotifications: (
    settings: NotificationsConfig,
  ) => Effect.Effect<void, ConfigInvalid | ConfigUnreadable | ConfigWriteError>
}

class Settings extends Context.Service<Settings, SettingsShape>()("vingroto/lib/server/Settings") {
  static readonly layer = Layer.effect(
    Settings,
    Effect.gen(function* makeSettings() {
      const events = yield* ServerEvents
      const paths = yield* AppPaths
      const fs = yield* FileSystem.FileSystem

      const persistSyncSettings = makeUpdateSyncSettings(paths.config, fs)
      const persistNotifications = makeUpdateNotifications(paths.config, fs)

      const saveSyncSettings = Effect.fn("Settings.saveSyncSettings")(function* persistSettings(
        settings: SyncConfig,
      ) {
        yield* persistSyncSettings(settings)
        yield* events.publish({ _tag: "config-changed" })
      })

      const saveNotifications = Effect.fn("Settings.saveNotifications")(function* persistSettings(
        settings: NotificationsConfig,
      ) {
        yield* persistNotifications(settings)
        yield* events.publish({ _tag: "config-changed" })
      })

      return Settings.of({ saveSyncSettings, saveNotifications })
    }),
  )
}

export { Settings, type SettingsShape }
