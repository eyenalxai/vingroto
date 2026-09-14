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

  const syncWindow = (paths: readonly string[] | undefined) => {
    untrack(() => {
      const config = options.config()
      if (config === undefined || syncing()) {
        return
      }
      setSyncing(true)
      options.onStatus(
        paths === undefined ? "syncing every mailbox" : `syncing ${paths.join(", ")}`,
      )
      const program = Effect.gen(function* runSync() {
        const sync = yield* SyncEngine
        const reports = yield* Effect.all(
          config.accounts.map((account) => sync.syncMailboxes(account, config.sync, paths)),
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
        yield* Effect.sync(() => {
          options.onStatus(
            errors.length > 0
              ? `sync failed · ${errors.join(" · ")}`
              : `synced · ${stored} new message(s)`,
          )
        })
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
