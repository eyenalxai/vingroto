import type { ServerEvent } from "@vingroto/core/protocol/events"

import { Duration, Effect, Fiber, Schedule, Stream } from "effect"
import { createEffect, onCleanup } from "solid-js"

import type { AppRuntime } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"

interface ServerEventsOptions {
  readonly runtime: AppRuntime
  readonly enabled: () => boolean
  readonly onEvent: (event: ServerEvent) => void
  readonly onDisconnected: (message: string) => void
}

const initialDelayMs = 250
const maximumDelayMs = 5000

const retrySchedule = Schedule.exponential(Duration.millis(initialDelayMs)).pipe(
  Schedule.jittered,
  Schedule.modifyDelay(({ duration }) =>
    Effect.succeed(Duration.min(duration, Duration.millis(maximumDelayMs))),
  ),
)

const useServerEvents = (options: ServerEventsOptions) => {
  createEffect(() => {
    if (!options.enabled()) {
      return
    }
    const program = Effect.gen(function* subscribeToServerEvents() {
      const consume = Effect.gen(function* consumeServerEvents() {
        const client = yield* MailClient
        const outcome = yield* client.events.pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              options.onEvent(event)
            }),
          ),
          Effect.result,
        )
        const message =
          outcome._tag === "Failure"
            ? describeClientFailure(outcome.failure).message
            : "the daemon ended the event stream"
        return yield* Effect.fail(message)
      })
      yield* consume.pipe(
        Effect.tapError((message) =>
          Effect.sync(() => {
            options.onDisconnected(message)
          }),
        ),
        Effect.retry(retrySchedule),
      )
    })
    const fiber = options.runtime.runFork(program)
    onCleanup(() => {
      options.runtime.runFork(Fiber.interrupt(fiber))
    })
  })
}

export { useServerEvents, type ServerEventsOptions }
