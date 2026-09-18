import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as PubSub from "effect/PubSub"
import * as Stream from "effect/Stream"

import type { ServerEvent } from "@/lib/protocol/events"

import { SyncEngine } from "@/lib/mail/sync"

interface ServerEventsShape {
  readonly publish: (event: ServerEvent) => Effect.Effect<void>
  readonly stream: Stream.Stream<ServerEvent>
}

class ServerEvents extends Context.Service<ServerEvents, ServerEventsShape>()(
  "vingroto/lib/server/ServerEvents",
) {
  static readonly layer = Layer.effect(
    ServerEvents,
    Effect.gen(function* makeServerEvents() {
      const sync = yield* SyncEngine
      const pubsub = yield* PubSub.unbounded<ServerEvent>()
      yield* sync.events.pipe(
        Stream.runForEach((event) => PubSub.publish(pubsub, event)),
        Effect.forkScoped,
      )
      return ServerEvents.of({
        publish: (event) => PubSub.publish(pubsub, event).pipe(Effect.asVoid),
        stream: Stream.fromPubSub(pubsub),
      })
    }),
  )
}

export { ServerEvents, type ServerEventsShape }
