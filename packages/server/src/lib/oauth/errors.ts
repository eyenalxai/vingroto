import * as Schema from "effect/Schema"

// The stored authorization is gone: the refresh token is missing, revoked, expired, or rejected.
// An `invalid_grant` response also lands here; the only recovery is signing in again.
class OAuthReauthorizationRequired extends Schema.TaggedError<OAuthReauthorizationRequired>()(
  "OAuthReauthorizationRequired",
  {
    message: Schema.String,
  },
) {}

// Everything else: the browser opener, the callback, the flow deadline, the token endpoint, the keyring.
class OAuthAuthorizationFailed extends Schema.TaggedError<OAuthAuthorizationFailed>()(
  "OAuthAuthorizationFailed",
  {
    message: Schema.String,
  },
) {}

type OAuthError = OAuthAuthorizationFailed | OAuthReauthorizationRequired

export { OAuthAuthorizationFailed, OAuthReauthorizationRequired, type OAuthError }
