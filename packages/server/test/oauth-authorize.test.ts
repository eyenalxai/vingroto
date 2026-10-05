import { describe, expect, test } from "bun:test"
import * as Deferred from "effect/Deferred"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import { createHash } from "node:crypto"

import { oauthClientSecretReference, oauthRefreshTokenReference } from "@/lib/credential/refs"

import type { CapturedAuthorization } from "./helpers/oauth"

import {
  alpha,
  callbackOpener,
  clientId,
  fetchRefused,
  makeFakeCredential,
  requireUrl,
  runOAuth,
  silentOpener,
  tokenResponse,
  withTokenEndpoint,
} from "./helpers/oauth"

describe("GoogleOAuth authorization", () => {
  test("the authorization URL carries the mail scope, offline consent and a PKCE S256 challenge", async () => {
    await withTokenEndpoint(async (endpoint) => {
      const credential = makeFakeCredential()
      const capture: CapturedAuthorization = {}
      endpoint.respond(() =>
        tokenResponse({ access_token: "at-1", expires_in: 3600, refresh_token: "rt-1" }),
      )
      await runOAuth(endpoint, credential, { openBrowser: callbackOpener(capture) }, (oauth) =>
        oauth.authorize({ clientId, email: alpha }),
      )
      const url = requireUrl(capture)
      expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth")
      expect(url.searchParams.get("scope")).toBe("https://mail.google.com/")
      expect(url.searchParams.get("response_type")).toBe("code")
      expect(url.searchParams.get("access_type")).toBe("offline")
      expect(url.searchParams.get("prompt")).toBe("consent")
      expect(url.searchParams.get("code_challenge_method")).toBe("S256")
      expect(url.searchParams.get("state") ?? "").toMatch(/^[\w-]{16,}$/u)
      const redirectUri = url.searchParams.get("redirect_uri")
      expect(redirectUri?.startsWith("http://127.0.0.1:")).toBe(true)
      const verifier = endpoint.requests[0]?.get("code_verifier")
      expect(verifier).not.toBeNull()
      const expectedChallenge = createHash("sha256")
        .update(verifier ?? "", "utf8")
        .digest("base64url")
      expect(url.searchParams.get("code_challenge")).toBe(expectedChallenge)
    })
  })

  test("a matching callback completes the exchange and stores the refresh token and client secret", async () => {
    await withTokenEndpoint(async (endpoint) => {
      const credential = makeFakeCredential()
      const capture: CapturedAuthorization = {}
      endpoint.respond(() =>
        tokenResponse({ access_token: "at-1", expires_in: 3600, refresh_token: "rt-1" }),
      )
      await runOAuth(endpoint, credential, { openBrowser: callbackOpener(capture) }, (oauth) =>
        oauth.authorize({ clientId, clientSecret: "secret-1", email: alpha }),
      )
      expect(credential.secrets.get(oauthRefreshTokenReference(alpha))).toBe("rt-1")
      expect(credential.secrets.get(oauthClientSecretReference(alpha))).toBe("secret-1")
      const exchange = endpoint.requests[0]
      expect(exchange?.get("grant_type")).toBe("authorization_code")
      expect(exchange?.get("client_id")).toBe(clientId)
      expect(exchange?.get("client_secret")).toBe("secret-1")
      expect(exchange?.get("code")).toBe("fake-code")
      expect(exchange?.get("redirect_uri")).toBe(
        requireUrl(capture).searchParams.get("redirect_uri"),
      )
      expect(exchange?.get("code_verifier")?.length).toBeGreaterThanOrEqual(43)
    })
  })

  test("a mismatching state is rejected without exchanging the code", async () => {
    await withTokenEndpoint(async (endpoint) => {
      const credential = makeFakeCredential()
      const capture: CapturedAuthorization = {}
      endpoint.respond(() =>
        tokenResponse({ access_token: "at-1", expires_in: 3600, refresh_token: "rt-1" }),
      )
      const failure = await runOAuth(
        endpoint,
        credential,
        { openBrowser: callbackOpener(capture, { state: "not-the-state" }) },
        (oauth) => Effect.flip(oauth.authorize({ clientId, email: alpha })),
      )
      expect(failure._tag).toBe("OAuthAuthorizationFailed")
      expect(endpoint.requests).toHaveLength(0)
      expect(credential.secrets.size).toBe(0)
    })
  })

  test("the client secret is omitted from the token request when it is absent", async () => {
    await withTokenEndpoint(async (endpoint) => {
      const credential = makeFakeCredential()
      const capture: CapturedAuthorization = {}
      endpoint.respond(() =>
        tokenResponse({ access_token: "at-1", expires_in: 3600, refresh_token: "rt-1" }),
      )
      await runOAuth(endpoint, credential, { openBrowser: callbackOpener(capture) }, (oauth) =>
        oauth.authorize({ clientId, email: alpha }),
      )
      expect(endpoint.requests[0]?.has("client_secret")).toBe(false)
      expect(credential.secrets.has(oauthClientSecretReference(alpha))).toBe(false)
    })
  })

  test("the flow times out and closes its loopback listener", async () => {
    await withTokenEndpoint(async (endpoint) => {
      const credential = makeFakeCredential()
      const capture: CapturedAuthorization = {}
      const failure = await runOAuth(
        endpoint,
        credential,
        { flowDeadline: Duration.millis(100), openBrowser: silentOpener(capture) },
        (oauth) => Effect.flip(oauth.authorize({ clientId, email: alpha })),
      )
      expect(failure._tag).toBe("OAuthAuthorizationFailed")
      const redirectUri = requireUrl(capture).searchParams.get("redirect_uri") ?? ""
      expect(await fetchRefused(redirectUri)).toBe(true)
    })
  })

  test("interrupting the flow closes its loopback listener", async () => {
    await withTokenEndpoint(async (endpoint) => {
      const credential = makeFakeCredential()
      const capture: CapturedAuthorization = {}
      const started = Deferred.makeUnsafe<null>()
      const openBrowser = (url: string) =>
        Effect.gen(function* holdOpen() {
          capture.url = url
          yield* Deferred.succeed(started, null)
          return yield* Effect.never
        })
      await runOAuth(endpoint, credential, { openBrowser }, (oauth) =>
        Effect.gen(function* interruptSignIn() {
          const fiber = yield* Effect.forkChild(oauth.authorize({ clientId, email: alpha }))
          yield* Deferred.await(started)
          yield* Fiber.interrupt(fiber).pipe(
            Effect.timeoutOrElse({
              duration: "2 seconds",
              orElse: () => Effect.die(new Error("the sign-in fiber did not interrupt")),
            }),
          )
        }),
      )
      const redirectUri = requireUrl(capture).searchParams.get("redirect_uri") ?? ""
      expect(await fetchRefused(redirectUri)).toBe(true)
    })
  })
})
