import { HttpApiMiddleware } from "effect/unstable/httpapi"

import { UnauthorizedError } from "./errors"

class Authorization extends HttpApiMiddleware.Service<Authorization>()(
  "vingroto/protocol/api/Authorization",
  {
    error: UnauthorizedError,
  },
) {}

export { Authorization }
