import { RouteNotFoundError } from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { HttpRouter, HttpServerResponse } from "effect/unstable/http"

const fallbackBody = {
  _tag: "RouteNotFoundError",
  message: "no route matched the request",
}

const notFoundLayer = HttpRouter.add("*", "*", (request) =>
  Effect.gen(function* notFound() {
    const path = new URL(request.url, "http://localhost").pathname
    const body = yield* Schema.encodeEffect(RouteNotFoundError)(
      new RouteNotFoundError({
        message: `no route for ${request.method} ${path}`,
      }),
    ).pipe(Effect.orElseSucceed(() => fallbackBody))
    return HttpServerResponse.jsonUnsafe(body, { status: 404 })
  }),
)

export { notFoundLayer }
