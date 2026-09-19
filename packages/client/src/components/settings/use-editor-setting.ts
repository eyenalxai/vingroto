import type { EditorConfig } from "@vingroto/core/config/schema"

import { Effect } from "effect"
import { createEffect, createSignal } from "solid-js"

import type { AppRuntime } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"

interface UseEditorSettingOptions {
  readonly runtime: AppRuntime
  readonly editor: () => EditorConfig
  readonly onStatus: (message: string, error?: boolean) => void
  readonly onSaved: () => void
  readonly onDisconnected: (message: string) => void
}

const editorOrder: readonly EditorConfig[] = ["builtin", "system"]

const useEditorSetting = (options: UseEditorSettingOptions) => {
  const [draft, setDraft] = createSignal<EditorConfig>(options.editor())
  const [source, setSource] = createSignal<EditorConfig>(options.editor())
  const [busy, setBusy] = createSignal(false)

  createEffect(() => {
    const next = options.editor()
    const previous = source()
    if (next === previous) {
      return
    }
    if (draft() === previous) {
      setDraft(next)
    }
    setSource(next)
  })

  const cycle = (delta: number) => {
    setDraft((current) => {
      const index = editorOrder.indexOf(current)
      const next = (index + delta + editorOrder.length) % editorOrder.length
      return editorOrder[next] ?? "builtin"
    })
  }

  const dirty = () => draft() !== source()

  const save = () => {
    if (busy()) {
      return
    }
    const editor = draft()
    setBusy(true)
    options.onStatus("saving…")
    const program = Effect.gen(function* persistEditorSetting() {
      const client = yield* MailClient
      yield* client.saveEditorSettings(editor).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            setBusy(false)
            options.onStatus(`editor set to ${editor}`)
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

  return { busy, cycle, dirty, save, value: draft }
}

export { useEditorSetting, type UseEditorSettingOptions }
