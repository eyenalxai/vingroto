import type { AccountConfig } from "@vingroto/core/config/schema"
import type { DraftId } from "@vingroto/core/ids"

import { Effect, Fiber } from "effect"
import { onCleanup } from "solid-js"

import type { PersistOutcome, RecipientParse } from "@/components/composer/composer-draft"
import type { ComposerTexts } from "@/components/composer/composer-fields"
import type { MailClientError } from "@/lib/api"
import type { ComposerSeed } from "@/lib/mail/compose"
import type { AppRuntime } from "@/lib/runtime"

import { saveDraft } from "@/components/composer/composer-draft"

interface DraftAutosaveOptions {
  readonly runtime: AppRuntime
  readonly seed: ComposerSeed
  readonly account: () => AccountConfig | undefined
  readonly texts: () => ComposerTexts
  readonly recipients: () => RecipientParse
  readonly draftId: () => DraftId | undefined
  readonly onSaved: (outcome: PersistOutcome) => void
  readonly onFailure: (label: string, error: MailClientError) => void
}

const autosaveDelay = "1 seconds"

const useDraftAutosave = (options: DraftAutosaveOptions) => {
  let autosave: Fiber.Fiber<void, unknown> | null = null

  const cancel = () => {
    if (autosave !== null) {
      options.runtime.runFork(Fiber.interrupt(autosave))
      autosave = null
    }
  }

  const autosaveDraft = Effect.gen(function* autosaveDraft() {
    yield* Effect.gen(function* persistAutosaveDraft() {
      const account = options.account()
      if (account === undefined) {
        return
      }
      const parsed = options.recipients()
      if (parsed._tag === "error") {
        return
      }
      const outcome = yield* saveDraft({
        account,
        texts: options.texts(),
        recipients: parsed,
        seed: options.seed,
        draftId: options.draftId(),
      })
      yield* Effect.sync(() => {
        options.onSaved(outcome)
      })
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          options.onFailure("could not save the draft", error)
        }),
      ),
    )
  })

  const schedule = () => {
    cancel()
    autosave = options.runtime.runFork(
      Effect.sleep(autosaveDelay).pipe(Effect.andThen(autosaveDraft)),
    )
  }

  onCleanup(cancel)

  return { cancel, schedule }
}

export { useDraftAutosave, type DraftAutosaveOptions }
