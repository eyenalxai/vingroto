import type { AccountConfig } from "@vingroto/core/config/schema"
import type * as Duration from "effect/Duration"

import { BunServices } from "@effect/platform-bun"
import { describeError } from "@vingroto/core/errors"
import { AccountId } from "@vingroto/core/ids"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"

import type { GoogleOAuthShape } from "@/lib/oauth/service"

import { oauthRefreshTokenReference } from "@/lib/credential/refs"
import { Credential, CredentialNotFound } from "@/lib/credential/service"
import { OAuthAuthorizationFailed } from "@/lib/oauth/errors"
import { GoogleOAuth } from "@/lib/oauth/service"

const alpha = AccountId.make("alpha@example.com")
const clientId = "alpha-client.apps.googleusercontent.com"

const account: AccountConfig = {
  auth: "oauth2",
  email: alpha,
  id: alpha,
  imap: { host: "imap.gmail.com", port: 993, security: "tls" },
  label: "Alpha",
  oauth: { clientId, provider: "gmail" },
  saveSent: true,
  smtp: { host: "smtp.gmail.com", port: 465, security: "tls" },
}

interface FakeCredential {
  readonly secrets: Map<string, string>
  readonly service: Credential["Service"]
}

const makeFakeCredential = (): FakeCredential => {
  const secrets = new Map<string, string>()
  const get = Effect.fn("Credential.get")(function* get(reference: string) {
    const secret = secrets.get(reference)
    if (secret === undefined) {
      return yield* new CredentialNotFound({
        reference,
        message: "no credentials stored for this account",
      })
    }
    return secret
  })
  const set = Effect.fn("Credential.set")(function* set(reference: string, secret: string) {
    yield* Effect.sync(() => {
      secrets.set(reference, secret)
    })
  })
  return { secrets, service: { get, set } }
}

type TokenResponder = (params: URLSearchParams) => Response | Promise<Response>

interface FakeTokenEndpoint {
  readonly requests: URLSearchParams[]
  readonly respond: (responder: TokenResponder) => void
  readonly stop: () => Promise<void>
  readonly url: string
}

const jsonResponse = (body: unknown, status = 200): Response =>
  Response.json(body, {
    headers: { "content-type": "application/json" },
    status,
  })

const tokenResponse = (body: {
  readonly access_token: string
  readonly expires_in: number
  readonly refresh_token?: string
}): Response => jsonResponse(body)

const withTokenEndpoint = async <A>(
  use: (endpoint: FakeTokenEndpoint) => Promise<A>,
): Promise<A> => {
  const requests: URLSearchParams[] = []
  let responder: TokenResponder = () => jsonResponse({})
  const server = Bun.serve({
    fetch: async (request) => {
      const params = new URLSearchParams(await request.text())
      requests.push(params)
      return responder(params)
    },
    hostname: "127.0.0.1",
    port: 0,
  })
  const endpoint: FakeTokenEndpoint = {
    requests,
    respond: (next) => {
      responder = next
    },
    stop: () => server.stop(true),
    url: `http://127.0.0.1:${server.port}/token`,
  }
  try {
    return await use(endpoint)
  } finally {
    await endpoint.stop()
  }
}

interface OAuthTestOptions {
  readonly flowDeadline?: Duration.Input
  readonly openBrowser?: (
    url: string,
  ) => Effect.Effect<void, OAuthAuthorizationFailed, HttpClient.HttpClient>
}

const makeRuntime = (
  endpoint: FakeTokenEndpoint,
  credential: FakeCredential,
  options: OAuthTestOptions,
) =>
  ManagedRuntime.make(
    GoogleOAuth.layerWith({
      ...(options.flowDeadline === undefined ? {} : { flowDeadline: options.flowDeadline }),
      ...(options.openBrowser === undefined ? {} : { openBrowser: options.openBrowser }),
      tokenEndpoint: endpoint.url,
    }).pipe(
      Layer.provide(
        Layer.mergeAll(Layer.succeed(Credential, credential.service), BunServices.layer),
      ),
    ),
  )

const runOAuth = async <A, E>(
  endpoint: FakeTokenEndpoint,
  credential: FakeCredential,
  options: OAuthTestOptions,
  program: (oauth: GoogleOAuthShape) => Effect.Effect<A, E>,
): Promise<A> => {
  const runtime = makeRuntime(endpoint, credential, options)
  try {
    return await runtime.runPromise(Effect.flatMap(GoogleOAuth, program))
  } finally {
    await runtime.dispose()
  }
}

interface CapturedAuthorization {
  url?: string
}

const requireUrl = (capture: CapturedAuthorization): URL => {
  if (capture.url === undefined) {
    throw new Error("the browser opener was not called")
  }
  return new URL(capture.url)
}

interface CallbackOverrides {
  readonly code?: string
  readonly error?: string
  readonly state?: string
}

const callbackOpener =
  (capture: CapturedAuthorization, overrides: CallbackOverrides = {}) =>
  (url: string) => {
    capture.url = url
    return Effect.gen(function* driveCallback() {
      const authorization = new URL(url)
      const redirectUri = authorization.searchParams.get("redirect_uri")
      const state = authorization.searchParams.get("state")
      if (redirectUri === null || state === null) {
        return yield* new OAuthAuthorizationFailed({
          message: "the authorization URL is missing redirect_uri or state",
        })
      }
      const callback = new URL(redirectUri)
      callback.searchParams.set("state", overrides.state ?? state)
      if (overrides.error === undefined) {
        callback.searchParams.set("code", overrides.code ?? "fake-code")
      } else {
        callback.searchParams.set("error", overrides.error)
      }
      const client = yield* HttpClient.HttpClient
      yield* client.get(callback.toString()).pipe(
        Effect.mapError(
          (error) =>
            new OAuthAuthorizationFailed({
              message: `the sign-in callback could not be delivered: ${describeError(error)}`,
            }),
        ),
      )
      return yield* Effect.void
    })
  }

const silentOpener = (capture: CapturedAuthorization) => (url: string) => {
  capture.url = url
  return Effect.void
}

const fetchRefused = async (url: string): Promise<boolean> => {
  const runtime = ManagedRuntime.make(FetchHttpClient.layer)
  try {
    return await runtime.runPromise(
      Effect.gen(function* checkRefused() {
        const client = yield* HttpClient.HttpClient
        return yield* client.get(url).pipe(
          Effect.as(false),
          Effect.orElseSucceed(() => true),
        )
      }),
    )
  } finally {
    await runtime.dispose()
  }
}

const seedRefreshToken = (credential: FakeCredential, token = "rt-1") => {
  credential.secrets.set(oauthRefreshTokenReference(alpha), token)
}

export {
  account,
  alpha,
  callbackOpener,
  clientId,
  fetchRefused,
  jsonResponse,
  makeFakeCredential,
  requireUrl,
  runOAuth,
  seedRefreshToken,
  silentOpener,
  tokenResponse,
  withTokenEndpoint,
  type CapturedAuthorization,
  type FakeCredential,
  type FakeTokenEndpoint,
}
