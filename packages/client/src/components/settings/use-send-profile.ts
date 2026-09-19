import type { SendConfig } from "@vingroto/core/config/schema"

import { Effect } from "effect"
import { createEffect, createSignal } from "solid-js"
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
  readonly onStatus: (message: string, error?: boolean) => void
  readonly onDisconnected: (message: string) => void
}

const sendFields: readonly FieldDescriptor<SendFieldId>[] = [
  { id: "delaySeconds", label: "Delay (s)", kind: "text", placeholder: "60" },
]

const parseDelay = (value: string) => {
  const parsed = Math.trunc(Number(value.trim()))
  return Number.isNaN(parsed) || parsed < 0 ? undefined : parsed
}

const draftFromConfig = (send: SendConfig): SendDraft => {
  return { delaySeconds: String(send.delaySeconds) }
}

const useSendProfile = (options: UseSendProfileOptions) => {
  const [draft, setDraft] = createStore<SendDraft>(draftFromConfig(options.send()))
  const [source, setSource] = createSignal(options.send())
  const [busy, setBusy] = createSignal(false)

  createEffect(() => {
    const next = options.send()
    const previous = source()
    if (next === previous) {
      return
    }
    if (draft.delaySeconds === String(previous.delaySeconds)) {
      setDraft(draftFromConfig(next))
    }
    setSource(next)
  })

  const value = (id: SendFieldId): string => draft[id]

  const dirty = () => draft.delaySeconds !== String(source().delaySeconds)

  const input = (id: SendFieldId, next: string) => {
    setDraft(id, next)
  }

  const save = () => {
    if (busy()) {
      return
    }
    const delaySeconds = parseDelay(draft.delaySeconds)
    if (delaySeconds === undefined) {
      options.onStatus("enter a delay of 0 seconds or more", true)
      return
    }
    setBusy(true)
    options.onStatus("saving…")
    const program = Effect.gen(function* persistSendSettings() {
      const client = yield* MailClient
      yield* client.saveSendSettings({ delaySeconds }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            setBusy(false)
            setDraft({ delaySeconds: String(delaySeconds) })
            options.onStatus("sending settings saved")
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

  return { busy, dirty, input, save, value }
}

export { sendFields, useSendProfile, type SendFieldId, type UseSendProfileOptions }
