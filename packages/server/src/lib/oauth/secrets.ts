import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

import type { Credential } from "@/lib/credential/service"

import { OAuthAuthorizationFailed } from "@/lib/oauth/errors"

// A missing secret is not a failure: the caller decides whether it can proceed without one.
// A keyring failure is always an authorization failure.
const readOptionalSecret = (
  credential: Credential["Service"],
  reference: string,
): Effect.Effect<Option.Option<string>, OAuthAuthorizationFailed> =>
  credential.get(reference).pipe(
    Effect.asSome,
    Effect.catchTags({
      CredentialNotFound: () => Effect.succeed(Option.none<string>()),
      KeyringError: (error) =>
        Effect.fail(
          new OAuthAuthorizationFailed({
            message: `the OS keyring could not be read: ${error.message}`,
          }),
        ),
    }),
  )

export { readOptionalSecret }
