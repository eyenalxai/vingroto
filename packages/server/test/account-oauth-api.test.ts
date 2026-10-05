import type { OAuthAuthorize } from "@vingroto/core/protocol/accounts"
import type { HttpApi, HttpApiClient } from "effect/unstable/httpapi"

import { Api } from "@vingroto/core/protocol/api"
import { Authorization } from "@vingroto/core/protocol/api/authorization"
import { describe, expect, test } from "bun:test"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import { HttpClientRequest, HttpServer } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiMiddleware, HttpApiTest } from "effect/unstable/httpapi"

import type { GoogleOAuthShape, OAuthAuthorizeInput } from "@/lib/oauth/service"

import { authorizeOAuthAccount } from "@/lib/api/accounts"
import { authorizationLayer } from "@/lib/api/authorization"
import { OAuthAuthorizationFailed } from "@/lib/oauth/errors"

const token = "test-token"

const unused = () => Effect.die("unused in this test")

interface AuthorizeCall {
  readonly email: string
  readonly clientId: string
  readonly clientSecret: string | undefined
}

interface OAuthStub {
  readonly calls: AuthorizeCall[]
  readonly service: GoogleOAuthShape
}

const makeOAuthStub = (
  authorize: (input: OAuthAuthorizeInput) => Effect.Effect<void, OAuthAuthorizationFailed>,
): OAuthStub => {
  const calls: AuthorizeCall[] = []
  const record = (input: OAuthAuthorizeInput) => {
    calls.push({
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      email: input.email,
    })
    return authorize(input)
  }
  return { calls, service: { accessToken: unused, authorize: record } }
}

const makeTestHandlers = (oauth: GoogleOAuthShape) =>
  HttpApiBuilder.group(Api, "accounts", (handlers) =>
    handlers.handleAll({
      "account.create": () => unused(),
      "account.discover": () => unused(),
      "account.oauth.authorize": ({ payload }) => authorizeOAuthAccount(oauth, payload),
      "account.reorder": () => unused(),
      "account.update": () => unused(),
      "account.username": () => unused(),
    }),
  )

const makeClient = HttpApiTest.groups(Api, ["accounts"])

type ApiGroups = typeof Api extends HttpApi.HttpApi<string, infer Groups> ? Groups : never

type ApiClient = HttpApiClient.Client<ApiGroups>

const clientAuthorization = HttpApiMiddleware.layerClient(Authorization, ({ next, request }) =>
  next(HttpClientRequest.bearerToken(request, token)),
)

const runApi = async <A, E>(
  oauth: GoogleOAuthShape,
  use: (client: ApiClient) => Effect.Effect<A, E>,
): Promise<A> => {
  const handlers = makeTestHandlers(oauth).pipe(Layer.provideMerge(authorizationLayer(token)))
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(handlers, HttpServer.layerServices, clientAuthorization),
  )
  try {
    return await runtime.runPromise(Effect.scoped(Effect.flatMap(makeClient, use)))
  } finally {
    await runtime.dispose()
  }
}

const authorize = (client: ApiClient, payload: OAuthAuthorize) =>
  client.accounts["account.oauth.authorize"]({ payload })

describe("account.oauth.authorize over the api", () => {
  test("runs the flow with the trimmed payload and resolves with void", async () => {
    const stub = makeOAuthStub(() => Effect.void)
    await runApi(stub.service, (client) =>
      authorize(client, {
        clientId: " alpha-client.apps.googleusercontent.com ",
        email: " alpha@example.com ",
      }),
    )
    expect(stub.calls).toEqual([
      {
        clientId: "alpha-client.apps.googleusercontent.com",
        clientSecret: undefined,
        email: "alpha@example.com",
      },
    ])
  })

  test("passes the client secret through when it is given", async () => {
    const stub = makeOAuthStub(() => Effect.void)
    await runApi(stub.service, (client) =>
      authorize(client, {
        clientId: "alpha-client.apps.googleusercontent.com",
        clientSecret: "secret-1",
        email: "alpha@example.com",
      }),
    )
    expect(stub.calls).toEqual([
      {
        clientId: "alpha-client.apps.googleusercontent.com",
        clientSecret: "secret-1",
        email: "alpha@example.com",
      },
    ])
  })

  test("maps an authorization failure to a credentials error", async () => {
    const message = "the Google sign-in did not complete within 300 seconds"
    const stub = makeOAuthStub(() => Effect.fail(new OAuthAuthorizationFailed({ message })))
    const error = await runApi(stub.service, (client) =>
      authorize(client, { clientId: "client-id", email: "alpha@example.com" }).pipe(Effect.flip),
    )
    expect(error).toMatchObject({ _tag: "CredentialsError", message })
  })

  test("rejects an empty email before the flow starts", async () => {
    const stub = makeOAuthStub(() => Effect.void)
    const error = await runApi(stub.service, (client) =>
      authorize(client, { clientId: "client-id", email: "   " }).pipe(Effect.flip),
    )
    expect(error).toMatchObject({ _tag: "InvalidRequestError", field: "body.email" })
    expect(stub.calls).toHaveLength(0)
  })

  test("rejects an empty client id before the flow starts", async () => {
    const stub = makeOAuthStub(() => Effect.void)
    const error = await runApi(stub.service, (client) =>
      authorize(client, { clientId: "  ", email: "alpha@example.com" }).pipe(Effect.flip),
    )
    expect(error).toMatchObject({ _tag: "InvalidRequestError", field: "body.clientId" })
    expect(stub.calls).toHaveLength(0)
  })

  test("interrupting the request interrupts the flow", async () => {
    const started = Deferred.makeUnsafe<null>()
    let interrupted = false
    const stub = makeOAuthStub(() =>
      Deferred.succeed(started, null).pipe(
        Effect.andThen(Effect.never),
        Effect.onInterrupt(() =>
          Effect.sync(() => {
            interrupted = true
          }),
        ),
      ),
    )
    await runApi(stub.service, (client) =>
      Effect.gen(function* interruptAuthorize() {
        const fiber = yield* Effect.forkChild(
          authorize(client, { clientId: "client-id", email: "alpha@example.com" }),
        )
        yield* Deferred.await(started)
        yield* Fiber.interrupt(fiber)
      }),
    )
    expect(interrupted).toBe(true)
  })
})
