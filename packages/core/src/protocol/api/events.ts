import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"

import { ServerEvent } from "../events"
import { InternalError } from "./errors"

const subscribe = HttpApiEndpoint.get("event.subscribe", "/api/events", {
  success: HttpApiSchema.StreamSse({ data: ServerEvent }),
  error: InternalError,
}).annotateMerge(
  OpenApi.annotations({
    identifier: "event.subscribe",
    summary: "Subscribe to events",
    description: "Stream daemon events as server-sent events.",
  }),
)

const EventGroup = HttpApiGroup.make("events").add(subscribe)

export { EventGroup }
