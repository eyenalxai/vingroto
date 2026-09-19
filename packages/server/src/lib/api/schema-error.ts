import { InvalidRequestError } from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import { HttpApiMiddleware } from "effect/unstable/httpapi"

import { describeRequestIssue } from "@/lib/api/schema-issue"

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
    const issue = describeRequestIssue(error.kind, error.cause.issue)
    const failure = new InvalidRequestError(
      issue.field === undefined
        ? { message: issue.message }
        : { field: issue.field, message: issue.message },
    )
    return Effect.logWarning("request schema rejected").pipe(
      Effect.annotateLogs({ kind: error.kind, message: issue.message, reason }),
      Effect.andThen(Effect.fail(failure)),
    )
  },
)

export { SchemaErrorMiddleware, schemaErrorLayer }
