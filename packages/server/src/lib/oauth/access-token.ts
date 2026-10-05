import type { AccountConfig } from "@vingroto/core/config/schema"
import type { AccountId } from "@vingroto/core/ids"
import type { HttpClient } from "effect/unstable/http"

import * as Clock from "effect/Clock"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Semaphore from "effect/Semaphore"

import type { Credential } from "@/lib/credential/service"
import type { OAuthError } from "@/lib/oauth/errors"

import { oauthClientSecretReference, oauthRefreshTokenReference } from "@/lib/credential/refs"
import { OAuthAuthorizationFailed, OAuthReauthorizationRequired } from "@/lib/oauth/errors"
import { normalizeClientSecret, requestTokens, tokenParams } from "@/lib/oauth/tokens"

const REFRESH_WINDOW_MILLIS = Duration.toMillis(Duration.minutes(5))

interface CachedAccessToken {
  readonly accessToken: string
  readonly expiresAtMillis: number
}

interface AccessTokenDeps {
  readonly client: HttpClient.HttpClient
  readonly credential: Credential["Service"]
  readonly tokenEndpoint: string
}

const isFresh = (token: CachedAccessToken, nowMillis: number): boolean =>
  token.expiresAtMillis - nowMillis > REFRESH_WINDOW_MILLIS

const makeAccessTokenProvider = (deps: AccessTokenDeps) => {
  const { client, credential, tokenEndpoint } = deps
  const tokens = new Map<AccountId, CachedAccessToken>()
  const refreshLocks = new Map<AccountId, Semaphore.Semaphore>()

  const lockFor = (accountId: AccountId): Semaphore.Semaphore => {
    const existing = refreshLocks.get(accountId)
    if (existing !== undefined) {
      return existing
    }
    const created = Semaphore.makeUnsafe(1)
    refreshLocks.set(accountId, created)
    return created
  }

  // An empty string means "no secret stored"; `normalizeClientSecret` turns it back into absent.
  const readSecret = (reference: string) =>
    credential.get(reference).pipe(
      Effect.catchTags({
        CredentialNotFound: () => Effect.succeed(""),
        KeyringError: (error) =>
          Effect.fail(
            new OAuthAuthorizationFailed({
              message: `the OS keyring could not be read: ${error.message}`,
            }),
          ),
      }),
    )

  const readRefreshToken = (account: AccountConfig) =>
    credential.get(oauthRefreshTokenReference(account.id)).pipe(
      Effect.catchTags({
        CredentialNotFound: () =>
          Effect.fail(
            new OAuthReauthorizationRequired({
              message: `${account.email} has no stored Google refresh token; re-authorize the account`,
            }),
          ),
        KeyringError: (error) =>
          Effect.fail(
            new OAuthAuthorizationFailed({
              message: `the OS keyring could not be read: ${error.message}`,
            }),
          ),
      }),
    )

  const refresh = Effect.fn("GoogleOAuth.refresh")(function* refreshAccessToken(
    account: AccountConfig,
  ) {
    const oauth = account.oauth
    if (oauth === undefined) {
      return yield* new OAuthAuthorizationFailed({
        message: `${account.email} is not configured for Google sign-in`,
      })
    }
    const refreshToken = yield* readRefreshToken(account)
    const storedSecret = yield* readSecret(oauthClientSecretReference(account.id))
    const clientSecret = normalizeClientSecret(storedSecret)
    const payload = yield* requestTokens(
      client,
      tokenEndpoint,
      tokenParams([
        ["client_id", oauth.clientId],
        ["client_secret", clientSecret],
        ["grant_type", "refresh_token"],
        ["refresh_token", refreshToken],
      ]),
    )
    if (payload.error !== undefined) {
      if (payload.error === "invalid_grant") {
        return yield* new OAuthReauthorizationRequired({
          message: `${account.email}: the Google authorization expired or was revoked; re-authorize the account`,
        })
      }
      return yield* new OAuthAuthorizationFailed({
        message: `Google rejected the token refresh: ${payload.error_description ?? payload.error}`,
      })
    }
    if (payload.access_token === undefined || payload.expires_in === undefined) {
      return yield* new OAuthAuthorizationFailed({
        message: "the Google token response did not include an access token and its expiry",
      })
    }
    const now = yield* Clock.currentTimeMillis
    return {
      accessToken: payload.access_token,
      expiresAtMillis: now + payload.expires_in * 1000,
    }
  })

  const accessToken: (account: AccountConfig) => Effect.Effect<string, OAuthError> = Effect.fn(
    "GoogleOAuth.accessToken",
  )(function* accessTokenForAccount(account: AccountConfig) {
    if (account.oauth === undefined) {
      return yield* new OAuthAuthorizationFailed({
        message: `${account.email} is not configured for Google sign-in`,
      })
    }
    const now = yield* Clock.currentTimeMillis
    const cached = tokens.get(account.id)
    if (cached !== undefined && isFresh(cached, now)) {
      return cached.accessToken
    }
    // Only one fiber per account refreshes; the others wait, then reuse the fresh token.
    return yield* Semaphore.withPermit(lockFor(account.id))(
      Effect.gen(function* refreshWithinLock() {
        const currentTime = yield* Clock.currentTimeMillis
        const current = tokens.get(account.id)
        if (current !== undefined && isFresh(current, currentTime)) {
          return current.accessToken
        }
        const refreshed = yield* refresh(account)
        yield* Effect.sync(() => {
          tokens.set(account.id, refreshed)
        })
        return refreshed.accessToken
      }),
    )
  })

  return accessToken
}

export { makeAccessTokenProvider }
