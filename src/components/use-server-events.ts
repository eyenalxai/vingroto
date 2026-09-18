import { Duration, Effect, Fiber, Stream } from "effect"
import { createEffect, onCleanup } from "solid-js"

import type { AppRuntime } from "@/lib/client/runtime"
import type { ServerEvent } from "@/lib/protocol/events"

import { MailClient } from "@/lib/client/api"

interface ServerEventsOptions {
  readonly runtime: AppRuntime
  readonly enabled: () => boolean
  readonly onEvent: (event: ServerEvent) => void
  readonly onDisconnected: (message: string) => void
}

const initialDelayMs = 250
const maximumDelayMs = 5000

const useServerEvents = (options: ServerEventsOptions) => {
  createEffect(() => {
    if (!options.enabled()) {
      return
    }
    const program = Effect.gen(function* subscribeToServerEvents() {
      let delay = initialDelayMs
      while (true) {
        let received = false
        const outcome = yield* Effect.gen(function* consumeServerEvents() {
          const client = yield* MailClient
          return yield* client.events.pipe(
            Stream.runForEach((event) =>
              Effect.sync(() => {
                received = true
                options.onEvent(event)
              }),
            ),
          )
        }).pipe(Effect.result)
        if (outcome._tag === "Failure") {
          options.onDisconnected(outcome.failure.message)
        } else {
          options.onDisconnected("the daemon ended the event stream")
        }
        if (received) {
          delay = initialDelayMs
        }
        yield* Effect.sleep(Duration.millis(delay))
        delay = Math.min(delay * 2, maximumDelayMs)
      }
    })
    const fiber = options.runtime.runFork(program)
    onCleanup(() => {
      options.runtime.runFork(Fiber.interrupt(fiber))
    })
  })
}

export { useServerEvents, type ServerEventsOptions }
