import type { AccountConfig } from "@vingroto/core/config/schema"

import { Effect, Fiber } from "effect"
import { createSignal } from "solid-js"

import type { AccountDraft } from "@/components/setup/form-model"
import type { AppRuntime, AppRuntimeError } from "@/lib/runtime"

import { validateDraft } from "@/components/setup/form-model"
import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"

type SavePhase = "idle" | "authorizing" | "creating"

type EscapeIntent = "leave" | "cancel-sign-in" | "keep-saving"

// Why: escape may interrupt the browser authorization, but never the create that follows it.
// The daemon can persist the account while the create request is still in flight.
const escapeIntent = (phase: SavePhase): EscapeIntent => {
  if (phase === "authorizing") {
    return "cancel-sign-in"
  }
  if (phase === "creating") {
    return "keep-saving"
  }
  return "leave"
}

interface UseAccountSaveOptions {
  readonly draft: AccountDraft
  readonly discovering: () => boolean
  readonly onSaved: (account: AccountConfig) => void
  readonly report: (message: string, isError?: boolean) => void
  readonly runtime: AppRuntime
}

const useAccountSave = (options: UseAccountSaveOptions) => {
  const [phase, setPhase] = createSignal<SavePhase>("idle")
  let saveFiber: Fiber.Fiber<void, AppRuntimeError> | null = null

  const busy = () => phase() !== "idle"
  const authorizing = () => phase() === "authorizing"

  const save = () => {
    if (busy()) {
      return
    }
    if (options.discovering()) {
      options.report("waiting for server detection to finish…")
      return
    }
    const result = validateDraft(options.draft)
    if (result._tag === "error") {
      options.report(result.message, true)
      return
    }
    const { authorization, value } = result
    setPhase(authorization === undefined ? "creating" : "authorizing")
    options.report(
      authorization === undefined ? "saving account…" : "waiting for browser authorization…",
    )
    const program = Effect.gen(function* persistAccount() {
      const client = yield* MailClient
      if (authorization !== undefined) {
        const authorized = yield* client.authorizeAccount(authorization).pipe(
          Effect.as(true),
          Effect.catch((error) =>
            Effect.sync(() => {
              options.report(`could not authorize · ${describeClientFailure(error).message}`, true)
              return false
            }),
          ),
        )
        if (!authorized) {
          return
        }
        yield* Effect.sync(() => {
          setPhase("creating")
          options.report("saving account…")
        })
      }
      yield* client.createAccount(value).pipe(
        Effect.tap((account) =>
          Effect.sync(() => {
            options.report(`saved ${account.label}`)
            options.onSaved(account)
          }),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            options.report(`could not save · ${describeClientFailure(error).message}`, true)
          }),
        ),
      )
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          setPhase("idle")
        }),
      ),
    )
    saveFiber = options.runtime.runFork(program)
  }

  const cancel = (): boolean => {
    if (!authorizing() || saveFiber === null) {
      return false
    }
    const fiber = saveFiber
    saveFiber = null
    options.runtime.runFork(Fiber.interrupt(fiber))
    options.report("Google sign-in cancelled")
    return true
  }

  const dispose = () => {
    if (saveFiber !== null) {
      options.runtime.runFork(Fiber.interrupt(saveFiber))
    }
  }

  return { authorizing, busy, cancel, dispose, phase, save }
}

export {
  escapeIntent,
  useAccountSave,
  type EscapeIntent,
  type SavePhase,
  type UseAccountSaveOptions,
}
