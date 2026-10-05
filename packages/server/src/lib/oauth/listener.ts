import type * as Scope from "effect/Scope"

import { describeError } from "@vingroto/core/errors"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"

import { OAuthAuthorizationFailed } from "@/lib/oauth/errors"

// Google's loopback redirect for Desktop clients is http://127.0.0.1:<port> with no path.
// The callback arrives on "/"; any other request (favicons, probes) is ignored.
const LOOPBACK_HOST = "127.0.0.1"

interface LoopbackListener {
  readonly redirectUri: string
}

const htmlResponse = (status: number, body: string): Response =>
  new Response(`<!doctype html><meta charset="utf-8"><p>${body}</p>`, {
    headers: { "content-type": "text/html; charset=utf-8" },
    status,
  })

const handleCallback = (
  request: Request,
  expectedState: string,
  callback: Deferred.Deferred<string, string>,
): Response => {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const error = url.searchParams.get("error")
  if (url.pathname !== "/" || (code === null && error === null)) {
    return new Response("not found", { status: 404 })
  }
  if (url.searchParams.get("state") !== expectedState) {
    Deferred.doneUnsafe(
      callback,
      Effect.fail("the Google sign-in callback did not match the request state"),
    )
    return htmlResponse(400, "The sign-in callback did not match this request. Return to vingroto.")
  }
  if (error !== null) {
    const description = url.searchParams.get("error_description") ?? error
    Deferred.doneUnsafe(callback, Effect.fail(`Google sign-in failed: ${description}`))
    return htmlResponse(400, "Google reported an error. Return to vingroto for details.")
  }
  if (code !== null) {
    Deferred.doneUnsafe(callback, Effect.succeed(code))
    return htmlResponse(200, "Signed in. You can close this tab and return to vingroto.")
  }
  return new Response("not found", { status: 404 })
}

const acquireLoopbackListener = (
  expectedState: string,
  callback: Deferred.Deferred<string, string>,
): Effect.Effect<LoopbackListener, OAuthAuthorizationFailed, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.try({
      catch: (cause) =>
        new OAuthAuthorizationFailed({
          message: `could not start the loopback sign-in listener: ${describeError(cause)}`,
        }),
      try: () => {
        const server = Bun.serve({
          fetch: (request) => handleCallback(request, expectedState, callback),
          hostname: LOOPBACK_HOST,
          port: 0,
        })
        return { redirectUri: `http://${LOOPBACK_HOST}:${server.port}`, server }
      },
    }),
    ({ server }) => Effect.promise(() => server.stop(true)),
  )

export { acquireLoopbackListener, type LoopbackListener }
