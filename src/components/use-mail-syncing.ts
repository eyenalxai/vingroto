import { Duration, Effect, Fiber, Schedule } from "effect"
import { createSignal, onCleanup, untrack } from "solid-js"

import type { AppConfig } from "@/lib/config/schema"
import type { AppRuntime } from "@/lib/runtime"

import { SyncEngine } from "@/lib/mail/sync"

interface MailSyncOptions {
  readonly runtime: AppRuntime
  readonly config: () => AppConfig | undefined
  readonly onStatus: (status: string) => void
  readonly onSynced: () => void
}

const useMailSyncing = (options: MailSyncOptions) => {
  const [syncing, setSyncing] = createSignal(false)

  const syncWindow = (paths: readonly string[] | undefined, accountId?: string) => {
    untrack(() => {
      const config = options.config()
      if (config === undefined || syncing()) {
        return
      }
      const accounts =
        accountId === undefined
          ? config.accounts
          : config.accounts.filter((account) => account.id === accountId)
      if (accounts.length === 0) {
        return
      }
      setSyncing(true)
      options.onStatus(
        paths === undefined ? "syncing all mailboxes" : `syncing ${paths.join(", ")}`,
      )
      const program = Effect.gen(function* runSync() {
        yield* Effect.logInfo(
          `sync requested · paths=${paths?.join(",") ?? "all"} · account=${accountId ?? "all"}`,
        )
        const sync = yield* SyncEngine
        const reports = yield* Effect.all(
          accounts.map((account) => sync.syncMailboxes(account, config.sync, paths)),
          { concurrency: 1 },
        )
        const errors: string[] = []
        let stored = 0
        for (const report of reports) {
          stored += report.stored
          for (const message of report.errors) {
            errors.push(message)
          }
        }
        const failure = errors[0]
        const status =
          failure === undefined
            ? stored === 0
              ? "up to date"
              : `synced · ${stored} new`
            : errors.length > 1
              ? `sync failed · ${failure} (+${errors.length - 1} more)`
              : `sync failed · ${failure}`
        yield* Effect.sync(() => {
          options.onStatus(status)
        })
        yield* errors.length > 0
          ? Effect.logWarning(`sync failed · ${errors.join(" · ")}`)
          : Effect.logInfo(`sync finished · stored=${stored}`)
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            setSyncing(false)
            options.onSynced()
          }),
        ),
      )
      options.runtime.runFork(program)
    })
  }

  const startPeriodic = (intervalMinutes: () => number) => {
    const fiber = options.runtime.runFork(
      Effect.repeat(
        Effect.sync(() => {
          syncWindow(["INBOX"])
        }),
        Schedule.spaced(Duration.minutes(intervalMinutes())),
      ),
    )
    onCleanup(() => {
      options.runtime.runFork(Fiber.interrupt(fiber))
    })
  }

  return { startPeriodic, syncWindow, syncing }
}

export { useMailSyncing }
