import type { AccountConfig } from "@vingroto/core/config/schema"
import type { PlatformError } from "effect/PlatformError"

import { describeError } from "@vingroto/core/errors"
import { AccountId } from "@vingroto/core/ids"
import * as Context from "effect/Context"
import { Crypto } from "effect/Crypto"
import * as Deferred from "effect/Deferred"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"

import type { OAuthError } from "@/lib/oauth/errors"

import { oauthClientSecretReference, oauthRefreshTokenReference } from "@/lib/credential/refs"
import { Credential } from "@/lib/credential/service"
import { makeAccessTokenProvider } from "@/lib/oauth/access-token"
import { buildAuthorizationUrl } from "@/lib/oauth/authorization-url"
import { openWithXdg } from "@/lib/oauth/browser"
import { OAuthAuthorizationFailed } from "@/lib/oauth/errors"
import { acquireLoopbackListener } from "@/lib/oauth/listener"
import { codeChallengeS256, makeCodeVerifier, makeState } from "@/lib/oauth/pkce"
import { normalizeClientSecret, requestTokens, tokenParams } from "@/lib/oauth/tokens"

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
const MAIL_SCOPE = "https://mail.google.com/"
const DEFAULT_FLOW_DEADLINE = Duration.minutes(5)

interface OAuthAuthorizeInput {
  readonly email: string
  readonly clientId: string
  readonly clientSecret?: string
}

interface GoogleOAuthOptions {
  readonly authorizationEndpoint: string
  readonly tokenEndpoint: string
  readonly flowDeadline: Duration.Input
  readonly openBrowser: (
    url: string,
  ) => Effect.Effect<void, OAuthAuthorizationFailed, HttpClient.HttpClient>
}

interface GoogleOAuthShape {
  readonly authorize: (input: OAuthAuthorizeInput) => Effect.Effect<void, OAuthError>
  readonly accessToken: (account: AccountConfig) => Effect.Effect<string, OAuthError>
}

const cryptoFailure = (error: PlatformError) =>
  new OAuthAuthorizationFailed({
    message: `could not build the PKCE challenge: ${describeError(error)}`,
  })

class GoogleOAuth extends Context.Service<GoogleOAuth, GoogleOAuthShape>()(
  "@vingroto/server/lib/oauth/service/GoogleOAuth",
) {
  static readonly layerWith = (options: Partial<GoogleOAuthOptions> = {}) =>
    Layer.effect(
      GoogleOAuth,
      Effect.gen(function* makeGoogleOAuth() {
        const credential = yield* Credential
        const crypto = yield* Crypto
        const spawner = yield* ChildProcessSpawner
        const client = yield* HttpClient.HttpClient
        const authorizationEndpoint = options.authorizationEndpoint ?? GOOGLE_AUTHORIZATION_ENDPOINT
        const tokenEndpoint = options.tokenEndpoint ?? GOOGLE_TOKEN_ENDPOINT
        const flowDeadline = options.flowDeadline ?? DEFAULT_FLOW_DEADLINE
        const openBrowser = options.openBrowser ?? openWithXdg(spawner)

        const accessToken = makeAccessTokenProvider({ client, credential, tokenEndpoint })

        const storeSecret = (reference: string, secret: string, label: string) =>
          credential.set(reference, secret).pipe(
            Effect.catchTags({
              CredentialNotFound: (error) =>
                Effect.fail(new OAuthAuthorizationFailed({ message: error.message })),
              KeyringError: (error) =>
                Effect.fail(
                  new OAuthAuthorizationFailed({
                    message: `could not store the ${label} in the OS keyring: ${error.message}`,
                  }),
                ),
            }),
          )

        const exchangeCode = Effect.fn("GoogleOAuth.exchangeCode")(
          function* exchangeAuthorizationCode(request: {
            readonly accountId: AccountId
            readonly clientId: string
            readonly clientSecret: string | undefined
            readonly code: string
            readonly redirectUri: string
            readonly verifier: string
          }) {
            const payload = yield* requestTokens(
              client,
              tokenEndpoint,
              tokenParams([
                ["client_id", request.clientId],
                ["client_secret", request.clientSecret],
                ["code", request.code],
                ["code_verifier", request.verifier],
                ["grant_type", "authorization_code"],
                ["redirect_uri", request.redirectUri],
              ]),
            )
            if (payload.error !== undefined) {
              return yield* new OAuthAuthorizationFailed({
                message: `Google rejected the authorization code: ${payload.error_description ?? payload.error}`,
              })
            }
            const refreshToken = payload.refresh_token
            if (refreshToken === undefined) {
              return yield* new OAuthAuthorizationFailed({
                message: "the Google token response did not include a refresh token",
              })
            }
            yield* storeSecret(
              oauthRefreshTokenReference(request.accountId),
              refreshToken,
              "Google refresh token",
            )
            if (request.clientSecret !== undefined) {
              yield* storeSecret(
                oauthClientSecretReference(request.accountId),
                request.clientSecret,
                "Google client secret",
              )
            }
            return yield* Effect.void
          },
        )

        const authorize = Effect.fn("GoogleOAuth.authorize")(function* authorizeGoogleAccount(
          input: OAuthAuthorizeInput,
        ) {
          // The account id mirrors the config writer's email-derived id.
          // The refresh token lands under the refs the account created right after this flow will read.
          const accountId = AccountId.make(input.email.trim().toLowerCase())
          const clientSecret = normalizeClientSecret(input.clientSecret)
          return yield* Effect.scoped(
            Effect.gen(function* runSignIn() {
              const verifier = yield* makeCodeVerifier(crypto).pipe(Effect.mapError(cryptoFailure))
              const codeChallenge = yield* codeChallengeS256(crypto, verifier).pipe(
                Effect.mapError(cryptoFailure),
              )
              const state = yield* makeState(crypto).pipe(Effect.mapError(cryptoFailure))
              const callback = yield* Deferred.make<string, string>()
              const listener = yield* acquireLoopbackListener(state, callback)
              const authorizationUrl = buildAuthorizationUrl({
                authorizationEndpoint,
                clientId: input.clientId,
                codeChallenge,
                loginHint: input.email,
                redirectUri: listener.redirectUri,
                scope: MAIL_SCOPE,
                state,
              })
              yield* openBrowser(authorizationUrl).pipe(
                Effect.provideService(HttpClient.HttpClient, client),
              )
              const code = yield* Deferred.await(callback).pipe(
                Effect.mapError((message) => new OAuthAuthorizationFailed({ message })),
              )
              yield* exchangeCode({
                accountId,
                clientId: input.clientId,
                clientSecret,
                code,
                redirectUri: listener.redirectUri,
                verifier,
              })
            }),
          ).pipe(
            Effect.timeoutOrElse({
              duration: flowDeadline,
              orElse: () =>
                Effect.fail(
                  new OAuthAuthorizationFailed({
                    message: `the Google sign-in did not complete within ${Duration.toSeconds(flowDeadline)} seconds`,
                  }),
                ),
            }),
          )
        })

        return GoogleOAuth.of({ accessToken, authorize })
      }),
    ).pipe(Layer.provide(FetchHttpClient.layer))

  static readonly layer = GoogleOAuth.layerWith()
}

export { GoogleOAuth, type GoogleOAuthOptions, type GoogleOAuthShape, type OAuthAuthorizeInput }
