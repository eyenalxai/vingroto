import type { ServerEvent } from "@vingroto/core/protocol/events"

import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as PubSub from "effect/PubSub"
import * as Stream from "effect/Stream"

interface ServerEventsShape {
  readonly publish: (event: ServerEvent) => Effect.Effect<void>
  readonly stream: Stream.Stream<ServerEvent>
  readonly shutdown: () => Effect.Effect<void>
}

class ServerEvents extends Context.Service<ServerEvents, ServerEventsShape>()(
  "vingroto/lib/server/ServerEvents",
) {
  static readonly layer = Layer.effect(
    ServerEvents,
    Effect.gen(function* makeServerEvents() {
      const pubsub = yield* PubSub.unbounded<ServerEvent>()
      const publish = Effect.fn("ServerEvents.publish")(function* publishEvent(event: ServerEvent) {
        yield* PubSub.publish(pubsub, event)
      })
      // Shutting the bus down ends open event streams so the HTTP server can close its SSE responses.
      const shutdown = Effect.fnUntraced(function* shutdownEvents() {
        yield* PubSub.shutdown(pubsub)
      })
      return ServerEvents.of({ publish, stream: Stream.fromPubSub(pubsub), shutdown })
    }),
  )
}

export { ServerEvents, type ServerEventsShape }
