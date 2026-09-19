import { Effect } from "effect"
import { createSignal } from "solid-js"

import type { AppRuntime } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"

interface UseNotificationsSettingOptions {
  readonly runtime: AppRuntime
  readonly onStatus: (message: string) => void
  readonly onSaved: () => void
  readonly onDisconnected: (message: string) => void
}

const useNotificationsSetting = (options: UseNotificationsSettingOptions) => {
  const [saving, setSaving] = createSignal(false)

  const toggle = (enabled: boolean) => {
    if (saving()) {
      return
    }
    setSaving(true)
    const program = Effect.gen(function* saveNotifications() {
      const client = yield* MailClient
      yield* client.saveNotifications({ enabled }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            options.onStatus(`notifications ${enabled ? "enabled" : "disabled"}`)
            options.onSaved()
          }),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            const failure = describeClientFailure(error)
            if (failure._tag === "connection") {
              options.onDisconnected(failure.message)
              return
            }
            options.onStatus(`could not update notifications · ${failure.message}`)
          }),
        ),
      )
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          setSaving(false)
        }),
      ),
    )
    options.runtime.runFork(program)
  }

  return { saving, toggle }
}

export { useNotificationsSetting, type UseNotificationsSettingOptions }
