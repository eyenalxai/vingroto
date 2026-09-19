import type { ServerEvent } from "@vingroto/core/protocol/events"

import { Effect, Fiber, Stream } from "effect"
import * as Data from "effect/Data"
import { createEffect, onCleanup } from "solid-js"

import type { MailClientError } from "@/lib/api"
import type { AppRuntime } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { describeClientFailure, reportDefects } from "@/lib/failure"
import { isTransientFailure, retrySchedule } from "@/lib/retry"

interface ServerEventsOptions {
  readonly runtime: AppRuntime
  readonly enabled: () => boolean
  readonly onEvent: (event: ServerEvent) => void
  readonly onDisconnected: (message: string) => void
}

type EventStreamFailure = Data.TaggedEnum<{
  Transient: { readonly message: string }
  Permanent: { readonly message: string }
}>

const eventStreamFailure = Data.taggedEnum<EventStreamFailure>()

const describeEventFailure = (error: MailClientError): EventStreamFailure => {
  const failure = describeClientFailure(error)
  return isTransientFailure(error)
    ? eventStreamFailure.Transient({ message: failure.message })
    : eventStreamFailure.Permanent({ message: failure.message })
}

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
        if (outcome._tag === "Failure") {
          return yield* Effect.fail(describeEventFailure(outcome.failure))
        }
        return yield* Effect.fail(
          eventStreamFailure.Transient({ message: "the daemon ended the event stream" }),
        )
      })
      yield* consume.pipe(
        Effect.tapError((failure) =>
          Effect.sync(() => {
            options.onDisconnected(failure.message)
          }),
        ),
        Effect.retry({
          schedule: retrySchedule,
          while: (failure) => failure._tag === "Transient",
        }),
        // Permanent failures were reported above; ending the fiber beats reconnecting forever.
        Effect.ignore,
      )
    }).pipe(reportDefects("could not watch the daemon events", options.onDisconnected))
    const fiber = options.runtime.runFork(program)
    onCleanup(() => {
      options.runtime.runFork(Fiber.interrupt(fiber))
    })
  })
}

export { useServerEvents, type ServerEventsOptions }
