import type { SyncConfig } from "@vingroto/core/config/schema"

import { Effect } from "effect"
import { createEffect, createSignal } from "solid-js"
import { createStore } from "solid-js/store"

import type { FieldDescriptor } from "@/components/setup/form-model"
import type { AppRuntime } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"

type SyncFieldId = "initialDays" | "intervalMinutes"

interface SyncDraft {
  initialDays: string
  intervalMinutes: string
}

interface UseSyncProfileOptions {
  readonly runtime: AppRuntime
  readonly sync: () => SyncConfig
  readonly onSaved: () => void
  readonly onStatus: (message: string, error?: boolean) => void
  readonly onDisconnected: (message: string) => void
}

const syncFields: readonly FieldDescriptor<SyncFieldId>[] = [
  { id: "initialDays", label: "Initial days", kind: "text", placeholder: "30" },
  { id: "intervalMinutes", label: "Interval (min)", kind: "text", placeholder: "5" },
]

const parseWholeNumber = (value: string) => {
  const parsed = Math.trunc(Number(value.trim()))
  return Number.isNaN(parsed) ? undefined : parsed
}

const useSyncProfile = (options: UseSyncProfileOptions) => {
  const [draft, setDraft] = createStore<SyncDraft>({ initialDays: "", intervalMinutes: "" })
  const [busy, setBusy] = createSignal(false)

  createEffect(() => {
    const sync = options.sync()
    setDraft({
      initialDays: String(sync.initialDays),
      intervalMinutes: String(sync.intervalMinutes),
    })
  })

  const value = (id: SyncFieldId): string => draft[id]

  const input = (id: SyncFieldId, next: string) => {
    setDraft(id, next)
  }

  const save = () => {
    if (busy()) {
      return
    }
    const initialDays = parseWholeNumber(draft.initialDays)
    const intervalMinutes = parseWholeNumber(draft.intervalMinutes)
    if (initialDays === undefined || intervalMinutes === undefined) {
      options.onStatus("enter whole numbers", true)
      return
    }
    setBusy(true)
    options.onStatus("saving…")
    const program = Effect.gen(function* persistSyncSettings() {
      const client = yield* MailClient
      yield* client.saveSyncSettings({ initialDays, intervalMinutes }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            setBusy(false)
            options.onStatus("sync settings saved")
            options.onSaved()
          }),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            setBusy(false)
            const failure = describeClientFailure(error)
            if (failure._tag === "connection") {
              options.onDisconnected(failure.message)
              return
            }
            options.onStatus(`could not save · ${failure.message}`, true)
          }),
        ),
      )
    })
    options.runtime.runFork(program)
  }

  return { busy, input, save, value }
}

export { syncFields, useSyncProfile, type SyncFieldId, type UseSyncProfileOptions }
