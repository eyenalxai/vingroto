import { InvalidRequestError } from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import { HttpApiMiddleware } from "effect/unstable/httpapi"

const reasonLimit = 1024

const truncateReason = (reason: string) =>
  reason.length <= reasonLimit
    ? reason
    : `${reason.slice(0, reasonLimit)}... (${reason.length - reasonLimit} more chars)`

class SchemaErrorMiddleware extends HttpApiMiddleware.Service<SchemaErrorMiddleware>()(
  "vingroto/lib/api/SchemaErrorMiddleware",
  { error: InvalidRequestError },
) {}

const schemaErrorLayer = HttpApiMiddleware.layerSchemaErrorTransform(
  SchemaErrorMiddleware,
  (error) => {
    const reason = truncateReason(error.cause.message)
    return Effect.logWarning("request schema rejected").pipe(
      Effect.annotateLogs({ kind: error.kind, reason }),
      Effect.andThen(Effect.fail(new InvalidRequestError({ message: reason }))),
    )
  },
)

export { SchemaErrorMiddleware, schemaErrorLayer }
