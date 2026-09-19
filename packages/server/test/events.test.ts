import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Stream from "effect/Stream"

import { ServerEvents } from "@/lib/events"

describe("ServerEvents", () => {
  test("shutting down ends open event streams", async () => {
    const collected = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* shutdownWhileStreaming() {
          const events = yield* ServerEvents
          const fiber = yield* Stream.runCollect(events.stream).pipe(Effect.forkScoped)
          yield* events.shutdown()
          return yield* Fiber.join(fiber).pipe(Effect.timeout("1 second"))
        }),
      ).pipe(Effect.provide(ServerEvents.layer)),
    )
    expect([...collected]).toEqual([])
  })
})
