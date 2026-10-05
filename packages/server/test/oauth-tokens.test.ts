import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"

import {
  account,
  clientId,
  jsonResponse,
  makeFakeCredential,
  runOAuth,
  seedRefreshToken,
  tokenResponse,
  withTokenEndpoint,
} from "./helpers/oauth"

describe("GoogleOAuth access tokens", () => {
  test("a live access token is cached and reused", async () => {
    await withTokenEndpoint(async (endpoint) => {
      const credential = makeFakeCredential()
      seedRefreshToken(credential)
      endpoint.respond(() => tokenResponse({ access_token: "at-1", expires_in: 3600 }))
      const tokens = await runOAuth(endpoint, credential, {}, (oauth) =>
        Effect.gen(function* accessTwice() {
          const first = yield* oauth.accessToken(account)
          const second = yield* oauth.accessToken(account)
          return [first, second]
        }),
      )
      expect(tokens).toEqual(["at-1", "at-1"])
      expect(endpoint.requests).toHaveLength(1)
      expect(endpoint.requests[0]?.get("grant_type")).toBe("refresh_token")
      expect(endpoint.requests[0]?.get("refresh_token")).toBe("rt-1")
      expect(endpoint.requests[0]?.get("client_id")).toBe(clientId)
      expect(endpoint.requests[0]?.has("client_secret")).toBe(false)
    })
  })

  test("a token within five minutes of expiry is refreshed before use", async () => {
    await withTokenEndpoint(async (endpoint) => {
      const credential = makeFakeCredential()
      seedRefreshToken(credential)
      endpoint.respond(() =>
        tokenResponse({
          access_token: `at-${String(endpoint.requests.length)}`,
          expires_in: 60,
        }),
      )
      const tokens = await runOAuth(endpoint, credential, {}, (oauth) =>
        Effect.gen(function* accessTwice() {
          const first = yield* oauth.accessToken(account)
          const second = yield* oauth.accessToken(account)
          return [first, second]
        }),
      )
      expect(tokens).toEqual(["at-1", "at-2"])
      expect(endpoint.requests).toHaveLength(2)
    })
  })

  test("concurrent calls make a single refresh request", async () => {
    await withTokenEndpoint(async (endpoint) => {
      const credential = makeFakeCredential()
      seedRefreshToken(credential)
      endpoint.respond(async () => {
        await Bun.sleep(50)
        return tokenResponse({ access_token: "at-1", expires_in: 3600 })
      })
      const tokens = await runOAuth(endpoint, credential, {}, (oauth) =>
        Effect.gen(function* accessConcurrently() {
          const firstFiber = yield* Effect.forkChild(oauth.accessToken(account))
          const secondFiber = yield* Effect.forkChild(oauth.accessToken(account))
          const first = yield* Fiber.join(firstFiber)
          const second = yield* Fiber.join(secondFiber)
          return [first, second]
        }),
      )
      expect(tokens).toEqual(["at-1", "at-1"])
      expect(endpoint.requests).toHaveLength(1)
    })
  })

  test("invalid_grant requires re-authorization", async () => {
    await withTokenEndpoint(async (endpoint) => {
      const credential = makeFakeCredential()
      seedRefreshToken(credential)
      endpoint.respond(() =>
        jsonResponse(
          { error: "invalid_grant", error_description: "Token has been expired or revoked." },
          400,
        ),
      )
      const failure = await runOAuth(endpoint, credential, {}, (oauth) =>
        Effect.flip(oauth.accessToken(account)),
      )
      expect(failure._tag).toBe("OAuthReauthorizationRequired")
    })
  })

  test("a missing refresh token requires re-authorization", async () => {
    await withTokenEndpoint(async (endpoint) => {
      const credential = makeFakeCredential()
      const failure = await runOAuth(endpoint, credential, {}, (oauth) =>
        Effect.flip(oauth.accessToken(account)),
      )
      expect(failure._tag).toBe("OAuthReauthorizationRequired")
      expect(endpoint.requests).toHaveLength(0)
    })
  })
})
