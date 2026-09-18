import { Authorization } from "@vingroto/core/protocol/api/authorization"
import { UnauthorizedError } from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { HttpServerRequest } from "effect/unstable/http"

const tokenFromHeader = (header = "") => {
  const separator = header.indexOf(" ")
  if (separator === -1 || header.slice(0, separator).toLowerCase() !== "bearer") {
    return ""
  }
  return header.slice(separator + 1).trim()
}

const authorizationLayer = (token: string) =>
  Layer.succeed(
    Authorization,
    Authorization.of((httpEffect) =>
      Effect.gen(function* authorize() {
        const request = yield* HttpServerRequest.HttpServerRequest
        if (tokenFromHeader(request.headers.authorization) === token) {
          return yield* httpEffect
        }
        return yield* new UnauthorizedError({ message: "a valid bearer token is required" })
      }),
    ),
  )

export { authorizationLayer }
