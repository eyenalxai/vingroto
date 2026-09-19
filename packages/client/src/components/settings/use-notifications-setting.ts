import type { NotificationsConfig } from "@vingroto/core/config/schema"

import { Effect } from "effect"
import { createEffect, createSignal } from "solid-js"

import type { AppRuntime } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"

interface UseNotificationsSettingOptions {
  readonly runtime: AppRuntime
  readonly notifications: () => NotificationsConfig
  readonly onStatus: (message: string, error?: boolean) => void
  readonly onSaved: () => void
  readonly onDisconnected: (message: string) => void
}

const useNotificationsSetting = (options: UseNotificationsSettingOptions) => {
  const [draft, setDraft] = createSignal(options.notifications().enabled)
  const [source, setSource] = createSignal(options.notifications())
  const [saving, setSaving] = createSignal(false)

  createEffect(() => {
    const next = options.notifications()
    const previous = source()
    if (next === previous) {
      return
    }
    if (draft() === previous.enabled) {
      setDraft(next.enabled)
    }
    setSource(next)
  })

  const dirty = () => draft() !== source().enabled

  const save = (enabled: boolean) => {
    if (saving()) {
      return
    }
    setDraft(enabled)
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
            options.onStatus(`could not update notifications · ${failure.message}`, true)
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

  const toggle = () => {
    save(!draft())
  }

  return { dirty, saving, toggle, value: draft }
}

export { useNotificationsSetting, type UseNotificationsSettingOptions }
