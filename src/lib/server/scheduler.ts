import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Semaphore from "effect/Semaphore"

import type { ConfigInvalid, ConfigUnreadable } from "@/lib/config/load"
import type { SyncReport } from "@/lib/protocol/mail"

import { AppPaths } from "@/lib/app-paths"
import { loadConfig } from "@/lib/config/load"
import { describeError } from "@/lib/errors"
import { MessagePrefetch } from "@/lib/mail/prefetch"
import { SyncEngine } from "@/lib/mail/sync"
import { ServerEvents } from "@/lib/server/events"

interface SyncRequest {
  readonly accountId?: string
  readonly paths?: readonly string[]
}

interface SchedulerShape {
  readonly request: (
    request: SyncRequest,
  ) => Effect.Effect<readonly SyncReport[], ConfigInvalid | ConfigUnreadable>
}

const defaultIntervalMinutes = 5

class Scheduler extends Context.Service<Scheduler, SchedulerShape>()(
  "vingroto/lib/server/Scheduler",
) {
  static readonly layer = Layer.effect(
    Scheduler,
    Effect.gen(function* makeScheduler() {
      const sync = yield* SyncEngine
      const prefetch = yield* MessagePrefetch
      const events = yield* ServerEvents
      const paths = yield* AppPaths
      const fs = yield* FileSystem.FileSystem
      const semaphore = yield* Semaphore.make(1)
      const readConfig = loadConfig().pipe(
        Effect.provideService(AppPaths, paths),
        Effect.provideService(FileSystem.FileSystem, fs),
      )

      const request = Effect.fn("Scheduler.request")(function* requestSync(input: SyncRequest) {
        return yield* semaphore.withPermits(1)(
          Effect.gen(function* runSync() {
            const config = yield* readConfig
            const accounts =
              input.accountId === undefined
                ? config.accounts
                : config.accounts.filter((account) => account.id === input.accountId)
            const reports = yield* Effect.all(
              accounts.map((account) => sync.syncMailboxes(account, config.sync, input.paths)),
              { concurrency: 1 },
            )
            yield* prefetch.unread(accounts)
            yield* events.publish({ _tag: "data-changed" })
            return reports
          }),
        )
      })

      const cycle = Effect.gen(function* runScheduledCycle() {
        const config = yield* readConfig
        if (config.accounts.length > 0) {
          yield* request({ paths: ["INBOX"] })
        }
        return config.sync.intervalMinutes
      })

      yield* Effect.forever(
        cycle.pipe(
          Effect.catch((error) =>
            Effect.logWarning("scheduled sync failed").pipe(
              Effect.annotateLogs({ reason: describeError(error) }),
              Effect.as(defaultIntervalMinutes),
            ),
          ),
          Effect.flatMap((minutes) => Effect.sleep(Duration.minutes(minutes))),
        ),
      ).pipe(Effect.forkScoped)

      return Scheduler.of({ request })
    }),
  )
}

export { Scheduler, type SchedulerShape, type SyncRequest }
