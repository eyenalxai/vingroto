import type { ServerEvent } from "@vingroto/core/protocol/events"

import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as PubSub from "effect/PubSub"
import * as Ref from "effect/Ref"
import * as Stream from "effect/Stream"

// Refresh signals: a subscriber that falls behind only needs the newest event, and producers must never block.
const eventCapacity = 256

interface ServerEventsShape {
  readonly publish: (event: ServerEvent) => Effect.Effect<void>
  readonly stream: Stream.Stream<ServerEvent>
  readonly subscribers: Effect.Effect<number>
  readonly shutdown: () => Effect.Effect<void>
}

class ServerEvents extends Context.Service<ServerEvents, ServerEventsShape>()(
  "vingroto/lib/server/ServerEvents",
) {
  static readonly layer = Layer.effect(
    ServerEvents,
    Effect.gen(function* makeServerEvents() {
      const pubsub = yield* PubSub.sliding<ServerEvent>(eventCapacity)
      const subscribers = yield* Ref.make(0)
      const publish = Effect.fn("ServerEvents.publish")(function* publishEvent(event: ServerEvent) {
        yield* PubSub.publish(pubsub, event)
      })
      // Counting subscriptions lets the daemon stay quiet while a tui announces new mail itself.
      const stream = Stream.unwrap(
        Effect.acquireRelease(
          Ref.update(subscribers, (count) => count + 1),
          () => Ref.update(subscribers, (count) => count - 1),
        ).pipe(Effect.as(Stream.fromPubSub(pubsub))),
      )
      // Shutting the bus down ends open event streams so the HTTP server can close its SSE responses.
      const shutdown = Effect.fnUntraced(function* shutdownEvents() {
        yield* PubSub.shutdown(pubsub)
      })
      return ServerEvents.of({ publish, stream, subscribers: Ref.get(subscribers), shutdown })
    }),
  )
}

export { ServerEvents, type ServerEventsShape }
