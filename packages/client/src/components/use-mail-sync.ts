import type { AppConfig } from "@vingroto/core/config/schema"
import type { AccountId } from "@vingroto/core/ids"
import type { SyncFailure } from "@vingroto/core/protocol/mail"

import { Effect } from "effect"
import { createSignal, untrack } from "solid-js"

import type { AppRuntime } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"
import { formatSyncFailure } from "@/lib/mail/failure-text"

interface MailSyncOptions {
  readonly runtime: AppRuntime
  readonly config: () => AppConfig | undefined
  readonly onStatus: (message: string) => void
  readonly onDisconnected: (message: string) => void
  readonly onFinished: () => void
}

const useMailSyncWindow = (options: MailSyncOptions) => {
  const [syncing, setSyncing] = createSignal(false)

  const syncWindow = (paths?: readonly string[], accountId?: AccountId) => {
    untrack(() => {
      const config = options.config()
      if (config === undefined || syncing()) {
        return
      }
      const accountsToSync =
        accountId === undefined
          ? config.accounts
          : config.accounts.filter((account) => account.id === accountId)
      if (accountsToSync.length === 0) {
        return
      }
      setSyncing(true)
      options.onStatus(
        paths === undefined ? "syncing all mailboxes" : `syncing ${paths.join(", ")}`,
      )
      const program = Effect.gen(function* runSync() {
        const syncRequest = { paths: paths?.join(",") ?? "all", account: accountId ?? "all" }
        yield* Effect.logInfo("sync requested").pipe(Effect.annotateLogs(syncRequest))
        const client = yield* MailClient
        const request = {
          ...(accountId === undefined ? {} : { accountId }),
          ...(paths === undefined ? {} : { paths }),
        }
        const result = yield* client.sync(request).pipe(Effect.result)
        if (result._tag === "Failure") {
          yield* Effect.sync(() => {
            const failure = describeClientFailure(result.failure)
            if (failure._tag === "connection") {
              options.onDisconnected(failure.message)
              return
            }
            options.onStatus(`sync failed · ${failure.message}`)
          })
          return
        }
        const failures: SyncFailure[] = []
        let stored = 0
        for (const report of result.success) {
          stored += report.stored
          failures.push(...report.errors)
        }
        const first = failures[0]
        const message =
          first === undefined
            ? stored === 0
              ? "up to date"
              : `synced · ${stored} new`
            : failures.length > 1
              ? `sync failed · ${formatSyncFailure(first)} (+${failures.length - 1} more)`
              : `sync failed · ${formatSyncFailure(first)}`
        yield* Effect.sync(() => {
          options.onStatus(message)
        })
        const failureMessage = failures.map((failure) => formatSyncFailure(failure)).join(" · ")
        yield* failures.length > 0
          ? Effect.logWarning("sync failed").pipe(Effect.annotateLogs({ errors: failureMessage }))
          : Effect.logInfo("sync finished").pipe(Effect.annotateLogs({ stored }))
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            setSyncing(false)
            options.onFinished()
          }),
        ),
      )
      options.runtime.runFork(program)
    })
  }

  return { syncWindow, syncing }
}

export { useMailSyncWindow, type MailSyncOptions }
