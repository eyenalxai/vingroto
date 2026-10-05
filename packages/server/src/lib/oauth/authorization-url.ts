interface AuthorizationUrlRequest {
  readonly authorizationEndpoint: string
  readonly clientId: string
  readonly redirectUri: string
  readonly scope: string
  readonly state: string
  readonly codeChallenge: string
  readonly loginHint?: string
}

// Google's installed-app flow: loopback redirect, code response, offline access.
// Prompt=consent forces a fresh refresh token on every authorization.
const buildAuthorizationUrl = (request: AuthorizationUrlRequest): string => {
  const url = new URL(request.authorizationEndpoint)
  url.searchParams.set("access_type", "offline")
  url.searchParams.set("client_id", request.clientId)
  url.searchParams.set("code_challenge", request.codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("prompt", "consent")
  url.searchParams.set("redirect_uri", request.redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", request.scope)
  url.searchParams.set("state", request.state)
  if (request.loginHint !== undefined) {
    url.searchParams.set("login_hint", request.loginHint)
  }
  return url.toString()
}

export { buildAuthorizationUrl, type AuthorizationUrlRequest }
