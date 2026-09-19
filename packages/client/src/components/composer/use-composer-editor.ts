import type { TextareaRenderable } from "@opentui/core"
import type { Setter } from "solid-js"

import { useRenderer } from "@opentui/solid"
import { Effect } from "effect"
import { createSignal } from "solid-js"

import type { ComposerField } from "@/components/composer/composer-fields"
import type { AppRuntime } from "@/lib/runtime"

import { editTextExternally } from "@/lib/external"

interface ComposerEditorOptions {
  readonly runtime: AppRuntime
  readonly body: () => string
  readonly setBody: Setter<string>
  readonly setField: Setter<ComposerField>
  readonly report: (message: string, error?: boolean) => void
}

const useComposerEditor = (options: ComposerEditorOptions) => {
  const renderer = useRenderer()
  const [editing, setEditing] = createSignal(false)
  const [textarea, setTextarea] = createSignal<TextareaRenderable>()

  const editExternally = () => {
    if (editing()) {
      return
    }
    setEditing(true)
    options.report("opening editor…")
    const program = Effect.gen(function* openComposerEditor() {
      yield* Effect.gen(function* runComposerEditor() {
        const editedText = yield* editTextExternally(renderer, options.body())
        yield* Effect.sync(() => {
          setEditing(false)
          options.setBody(editedText)
          const target = textarea()
          if (target !== undefined) {
            target.setText(editedText)
            target.focus()
          }
          options.setField("body")
          options.report("body updated from the editor")
        })
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            setEditing(false)
            options.report(error.message, true)
          }),
        ),
      )
    })
    options.runtime.runFork(program)
  }

  return { editExternally, editing, setTextarea, textarea }
}

export { useComposerEditor, type ComposerEditorOptions }
