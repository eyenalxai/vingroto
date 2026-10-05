import type { HttpClient } from "effect/unstable/http"

import { describeError } from "@vingroto/core/errors"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { HttpClientRequest, HttpClientResponse } from "effect/unstable/http"

import { OAuthAuthorizationFailed } from "@/lib/oauth/errors"

// Google returns an error object with a 4xx status for rejected requests.
// Every field is optional, so the caller decides what an absent token or a present error means.
const TokenPayload = Schema.Struct({
  access_token: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Schema.String),
  error_description: Schema.optionalKey(Schema.String),
  expires_in: Schema.optionalKey(Schema.Finite),
  refresh_token: Schema.optionalKey(Schema.String),
})

// Absent values are dropped so an omitted client secret never reaches the token endpoint.
const tokenParams = (
  entries: readonly (readonly [string, string | undefined])[],
): readonly (readonly [string, string])[] =>
  entries.flatMap(([key, value]) => (value === undefined ? [] : [[key, value] as const]))

const normalizeClientSecret = (clientSecret: string | undefined): string | undefined =>
  clientSecret === undefined || clientSecret.length === 0 ? undefined : clientSecret

const requestTokens = Effect.fn("OAuth.requestTokens")(function* postTokenRequest(
  client: HttpClient.HttpClient,
  endpoint: string,
  params: readonly (readonly [string, string])[],
): Effect.fn.Return<typeof TokenPayload.Type, OAuthAuthorizationFailed> {
  return yield* HttpClientRequest.post(endpoint).pipe(
    HttpClientRequest.bodyUrlParams(params),
    client.execute,
    Effect.flatMap(HttpClientResponse.schemaBodyJson(TokenPayload)),
    Effect.mapError(
      (error) =>
        new OAuthAuthorizationFailed({
          message: `the Google token endpoint request failed: ${describeError(error)}`,
        }),
    ),
  )
})

export { normalizeClientSecret, requestTokens, tokenParams }
