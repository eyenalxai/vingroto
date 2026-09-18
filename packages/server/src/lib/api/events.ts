import type { ServerEvent } from "@vingroto/core/protocol/events"

import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import { Sse } from "effect/unstable/encoding"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { ServerApi } from "@/lib/api/api"
import { ServerEvents } from "@/lib/events"

const heartbeatInterval = "15 seconds"
const heartbeat = ": heartbeat\n\n"

const encodeEvent = (event: ServerEvent) =>
  Sse.encoder.write({
    _tag: "Event",
    event: "message",
    id: undefined,
    data: JSON.stringify(event),
  })

const EventHandlers = HttpApiBuilder.group(ServerApi, "events", (handlers) =>
  handlers.handle("event.subscribe", () =>
    ServerEvents.pipe(
      Effect.map((events) => {
        const output = Stream.merge(
          events.stream.pipe(Stream.map((event) => encodeEvent(event))),
          Stream.tick(heartbeatInterval).pipe(Stream.map(() => heartbeat)),
          { haltStrategy: "left" },
        )
        return HttpServerResponse.stream(output.pipe(Stream.encodeText), {
          contentType: "text/event-stream",
          headers: {
            "cache-control": "no-cache, no-transform",
            "x-accel-buffering": "no",
            "x-content-type-options": "nosniff",
          },
        })
      }),
    ),
  ),
)

export { EventHandlers }
