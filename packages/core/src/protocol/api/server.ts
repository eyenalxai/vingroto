import * as Schema from "effect/Schema"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"

import { ServerStatus } from "../accounts"
import { InternalError } from "./errors"

const health = HttpApiEndpoint.get("server.health", "/api/health", {
  success: Schema.Struct({ healthy: Schema.Literal(true) }),
}).annotateMerge(
  OpenApi.annotations({
    identifier: "server.health",
    summary: "Check daemon health",
    description: "Report whether the daemon is ready to accept requests.",
  }),
)

const status = HttpApiEndpoint.get("server.status", "/api/status", {
  success: ServerStatus,
  error: InternalError,
}).annotateMerge(
  OpenApi.annotations({
    identifier: "server.status",
    summary: "Get daemon status",
    description: "Return the daemon version, process metadata, config state and database state.",
  }),
)

const ServerGroup = HttpApiGroup.make("server").add(health, status)

export { ServerGroup }
