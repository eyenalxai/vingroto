import type { KeyEvent } from "@opentui/core"
import type { SyncConfig } from "@vingroto/core/config/schema"

import { describeError } from "@vingroto/core/errors"
import { Effect } from "effect"
import { createEffect, createMemo, createSignal } from "solid-js"
import { createStore } from "solid-js/store"

import type { FieldDescriptor } from "@/components/setup/form-model"
import type { AppRuntime } from "@/lib/runtime"

import { MailClient } from "@/lib/api"

type SyncFieldId = "initialDays" | "intervalMinutes"

interface SyncDraft {
  initialDays: string
  intervalMinutes: string
}

interface UseSyncProfileOptions {
  readonly runtime: AppRuntime
  readonly sync: () => SyncConfig
  readonly onSaved: () => void
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
  const [focusIndex, setFocusIndex] = createSignal(0)
  const [status, setStatus] = createSignal("")
  const [statusError, setStatusError] = createSignal(false)
  const [busy, setBusy] = createSignal(false)

  const focusedField = createMemo(() => syncFields[focusIndex()])

  const report = (message: string, isError = false) => {
    setStatus(message)
    setStatusError(isError)
  }

  createEffect(() => {
    const sync = options.sync()
    setDraft({
      initialDays: String(sync.initialDays),
      intervalMinutes: String(sync.intervalMinutes),
    })
  })

  const fieldValue = (id: SyncFieldId): string => draft[id]

  const moveFocus = (delta: number) => {
    const count = syncFields.length
    setFocusIndex((current) => (current + delta + count) % count)
  }

  const input = (id: SyncFieldId, value: string) => {
    setDraft(id, value)
  }

  const save = () => {
    if (busy()) {
      return
    }
    const initialDays = parseWholeNumber(draft.initialDays)
    const intervalMinutes = parseWholeNumber(draft.intervalMinutes)
    if (initialDays === undefined || intervalMinutes === undefined) {
      report("enter whole numbers", true)
      return
    }
    setBusy(true)
    report("saving…")
    const program = Effect.gen(function* persistSyncSettings() {
      const client = yield* MailClient
      yield* client.saveSyncSettings({ initialDays, intervalMinutes }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            setBusy(false)
            report("saved")
            options.onSaved()
          }),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            setBusy(false)
            report(`could not save · ${describeError(error)}`, true)
          }),
        ),
      )
    })
    options.runtime.runFork(program)
  }

  const handleKey = (event: KeyEvent): boolean => {
    if (event.ctrl && event.name === "s") {
      save()
      return true
    }
    if (event.name === "tab") {
      moveFocus(event.shift ? -1 : 1)
      return true
    }
    if (event.name === "down" && !event.shift) {
      moveFocus(1)
      return true
    }
    if (event.name === "up" && !event.shift) {
      moveFocus(-1)
      return true
    }
    if (event.name === "return") {
      if (focusIndex() === syncFields.length - 1) {
        save()
      } else {
        moveFocus(1)
      }
      return true
    }
    return false
  }

  return { busy, fieldValue, focusedField, handleKey, input, save, status, statusError }
}

export { syncFields, useSyncProfile, type SyncFieldId, type UseSyncProfileOptions }
