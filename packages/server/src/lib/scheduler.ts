import type { AccountId } from "@vingroto/core/ids"
import type { SyncReport } from "@vingroto/core/protocol/mail"

import { AppPaths } from "@vingroto/core/app-paths"
import { describeError } from "@vingroto/core/errors"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as Semaphore from "effect/Semaphore"

import type { ConfigInvalid, ConfigUnreadable } from "@/lib/config/load"

import { loadConfigFile } from "@/lib/config/load"
import { ServerEvents } from "@/lib/events"
import { MessagePrefetch } from "@/lib/mail/prefetch"
import { SyncEngine } from "@/lib/mail/sync"

interface SyncRequest {
  readonly accountId?: AccountId
  readonly paths?: readonly string[]
}

interface SchedulerShape {
  readonly request: (
    request: SyncRequest,
  ) => Effect.Effect<readonly SyncReport[], ConfigInvalid | ConfigUnreadable>
}

const defaultIntervalMinutes = 5

class Scheduler extends Context.Service<Scheduler, SchedulerShape>()(
  "@vingroto/server/lib/scheduler",
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
      const readConfig = loadConfigFile(paths.config, fs)

      const request = Effect.fn("Scheduler.request")(function* requestSync(input: SyncRequest) {
        return yield* semaphore.withPermits(1)(
          Effect.gen(function* runSync() {
            const config = yield* readConfig
            const accounts =
              input.accountId === undefined
                ? config.accounts
                : config.accounts.filter((account) => account.id === input.accountId)
            const reports = yield* Effect.forEach(
              accounts,
              (account) => sync.syncMailboxes(account, config.sync, input.paths),
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

      const cadence = Schedule.spaced(Duration.zero).pipe(
        Schedule.setInputType<number>(),
        Schedule.modifyDelay(({ input }) => Effect.succeed(Duration.minutes(input))),
      )

      yield* cycle.pipe(
        Effect.catch((error) =>
          Effect.logWarning("scheduled sync failed").pipe(
            Effect.annotateLogs({ reason: describeError(error) }),
            Effect.as(defaultIntervalMinutes),
          ),
        ),
        Effect.repeat(cadence),
        Effect.forkScoped,
      )

      return Scheduler.of({ request })
    }),
  )
}

export { Scheduler, type SchedulerShape, type SyncRequest }
