import type { Crypto } from "effect/Crypto"

import * as Effect from "effect/Effect"

// RFC 7636: the verifier is 43-128 unreserved characters; 32 random bytes base64url-encode to 43.
const VERIFIER_BYTES = 32
const STATE_BYTES = 16

const base64Url = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url")

const makeCodeVerifier = (crypto: Crypto) =>
  Effect.map(crypto.randomBytes(VERIFIER_BYTES), base64Url)

const makeState = (crypto: Crypto) => Effect.map(crypto.randomBytes(STATE_BYTES), base64Url)

const codeChallengeS256 = (crypto: Crypto, verifier: string) =>
  Effect.map(crypto.digest("SHA-256", new TextEncoder().encode(verifier)), base64Url)

export { codeChallengeS256, makeCodeVerifier, makeState }
