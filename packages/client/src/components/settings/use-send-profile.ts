import type { KeyEvent } from "@opentui/core"
import type { SendConfig } from "@vingroto/core/config/schema"

import { Effect } from "effect"
import { createEffect, createMemo, createSignal } from "solid-js"
import { createStore } from "solid-js/store"

import type { FieldDescriptor } from "@/components/setup/form-model"
import type { AppRuntime } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"

type SendFieldId = "delaySeconds"

interface SendDraft {
  delaySeconds: string
}

interface UseSendProfileOptions {
  readonly runtime: AppRuntime
  readonly send: () => SendConfig
  readonly onSaved: () => void
  readonly onDisconnected: (message: string) => void
}

const sendFields: readonly FieldDescriptor<SendFieldId>[] = [
  { id: "delaySeconds", label: "Delay (s)", kind: "text", placeholder: "60" },
]

const parseDelay = (value: string) => {
  const parsed = Math.trunc(Number(value.trim()))
  return Number.isNaN(parsed) || parsed < 0 ? undefined : parsed
}

const useSendProfile = (options: UseSendProfileOptions) => {
  const [draft, setDraft] = createStore<SendDraft>({ delaySeconds: "" })
  const [focusIndex, setFocusIndex] = createSignal(0)
  const [status, setStatus] = createSignal("")
  const [statusError, setStatusError] = createSignal(false)
  const [busy, setBusy] = createSignal(false)

  const focusedField = createMemo(() => sendFields[focusIndex()])

  const report = (message: string, isError = false) => {
    setStatus(message)
    setStatusError(isError)
  }

  createEffect(() => {
    setDraft({ delaySeconds: String(options.send().delaySeconds) })
  })

  const fieldValue = (id: SendFieldId): string => draft[id]

  const moveFocus = (delta: number) => {
    const count = sendFields.length
    setFocusIndex((current) => (current + delta + count) % count)
  }

  const input = (id: SendFieldId, value: string) => {
    setDraft(id, value)
  }

  const save = () => {
    if (busy()) {
      return
    }
    const delaySeconds = parseDelay(draft.delaySeconds)
    if (delaySeconds === undefined) {
      report("enter a delay of 0 seconds or more", true)
      return
    }
    setBusy(true)
    report("saving…")
    const program = Effect.gen(function* persistSendSettings() {
      const client = yield* MailClient
      yield* client.saveSendSettings({ delaySeconds }).pipe(
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
            const failure = describeClientFailure(error)
            if (failure._tag === "connection") {
              options.onDisconnected(failure.message)
              return
            }
            report(`could not save · ${failure.message}`, true)
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
      if (focusIndex() === sendFields.length - 1) {
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

export { sendFields, useSendProfile, type SendFieldId, type UseSendProfileOptions }
