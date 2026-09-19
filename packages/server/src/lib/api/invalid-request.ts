import type { HttpApiError } from "effect/unstable/httpapi"

import { InvalidRequestError } from "@vingroto/core/protocol/api/errors"

import { requestFieldPath } from "@/lib/api/schema-issue"

type RequestPart = HttpApiError.HttpApiSchemaError["kind"]

const invalidField = (part: RequestPart, field: string, message: string) =>
  new InvalidRequestError({ field: requestFieldPath(part, field), message })

export { invalidField }
