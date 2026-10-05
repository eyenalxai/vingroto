import type { AccountConfig } from "@vingroto/core/config/schema"

import { Effect, Fiber } from "effect"
import { createSignal } from "solid-js"

import type { AccountDraft } from "@/components/setup/form-model"
import type { AppRuntimeError } from "@/lib/runtime"

import { useRuntime } from "@/components/runtime-provider"
import { validateDraft } from "@/components/setup/form-model"
import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"

interface UseAccountSaveOptions {
  readonly draft: AccountDraft
  readonly discovering: () => boolean
  readonly onSaved: (account: AccountConfig) => void
  readonly report: (message: string, isError?: boolean) => void
}

// Why: the OAuth save is two requests, and escape must interrupt the first one without leaving an account.
const useAccountSave = (options: UseAccountSaveOptions) => {
  const runtime = useRuntime()
  const [busy, setBusy] = createSignal(false)
  const [authorizing, setAuthorizing] = createSignal(false)
  let saveFiber: Fiber.Fiber<void, AppRuntimeError> | null = null

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
    setBusy(true)
    setAuthorizing(authorization !== undefined)
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
          setBusy(false)
          setAuthorizing(false)
        }),
      ),
    )
    saveFiber = runtime.runFork(program)
  }

  const cancel = (): boolean => {
    if (!authorizing() || saveFiber === null) {
      return false
    }
    const fiber = saveFiber
    saveFiber = null
    setAuthorizing(false)
    runtime.runFork(Fiber.interrupt(fiber))
    options.report("Google sign-in cancelled")
    return true
  }

  const dispose = () => {
    if (saveFiber !== null) {
      runtime.runFork(Fiber.interrupt(saveFiber))
    }
  }

  return { authorizing, busy, cancel, dispose, save }
}

export { useAccountSave, type UseAccountSaveOptions }
