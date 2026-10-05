import type { AccountConfig } from "@vingroto/core/config/schema"
import type { AccountId } from "@vingroto/core/ids"

import { Effect, Fiber } from "effect"
import { createSignal } from "solid-js"

import type { AppRuntime, AppRuntimeError } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"

interface UseAccountReauthorizeOptions {
  readonly runtime: AppRuntime
  readonly accounts: () => readonly AccountConfig[]
  readonly onAuthorized: (account: AccountConfig) => void
  readonly onStatus: (message: string, error?: boolean) => void
  readonly onDisconnected: (message: string) => void
}

const useAccountReauthorize = (options: UseAccountReauthorizeOptions) => {
  const [busyIds, setBusyIds] = createSignal<ReadonlySet<AccountId>>(new Set())
  const fibers: Fiber.Fiber<void, AppRuntimeError>[] = []

  const setBusy = (accountId: AccountId, present: boolean) => {
    setBusyIds((current) => {
      const next = new Set(current)
      if (present) {
        next.add(accountId)
      } else {
        next.delete(accountId)
      }
      return next
    })
  }

  const reauthorize = (accountId: AccountId) => {
    if (busyIds().has(accountId)) {
      return
    }
    const account = options.accounts().find((candidate) => candidate.id === accountId)
    if (account === undefined || account.auth !== "oauth2" || account.oauth === undefined) {
      return
    }
    const clientId = account.oauth.clientId
    setBusy(accountId, true)
    options.onStatus("waiting for browser authorization…")
    const program = Effect.gen(function* reauthorizeAccount() {
      const client = yield* MailClient
      yield* client.authorizeAccount({ email: account.email, clientId }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            setBusy(accountId, false)
            options.onStatus(`re-authorized ${account.label} · syncing`)
            options.onAuthorized(account)
          }),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            setBusy(accountId, false)
            const failure = describeClientFailure(error)
            if (failure._tag === "connection") {
              options.onDisconnected(failure.message)
              return
            }
            options.onStatus(`could not re-authorize · ${failure.message}`, true)
          }),
        ),
      )
    })
    fibers.push(options.runtime.runFork(program))
  }

  const dispose = () => {
    for (const fiber of fibers) {
      options.runtime.runFork(Fiber.interrupt(fiber))
    }
    fibers.length = 0
  }

  return {
    busy: (accountId: AccountId) => busyIds().has(accountId),
    busyAny: () => busyIds().size > 0,
    dispose,
    reauthorize,
  }
}

export { useAccountReauthorize, type UseAccountReauthorizeOptions }
