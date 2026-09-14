import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"

import type { KeyringError } from "@/lib/credential/keyring"
import type { OnePasswordError } from "@/lib/credential/onepassword"

import { lookupSecret, storeSecret } from "@/lib/credential/keyring"
import { readSecret } from "@/lib/credential/onepassword"

interface CredentialShape {
  readonly get: (
    reference: string,
    options?: { readonly refresh?: boolean },
  ) => Effect.Effect<string, CredentialError>
}

type CredentialError = KeyringError | OnePasswordError

class Credential extends Context.Service<Credential, CredentialShape>()(
  "vingroto/lib/credential/Credential",
) {
  static readonly layer = Layer.effect(
    Credential,
    Effect.gen(function* makeCredential() {
      const spawner = yield* ChildProcessSpawner
      const get = Effect.fn("Credential.get")(function* get(
        reference: string,
        options?: { readonly refresh?: boolean },
      ) {
        if (options?.refresh !== true) {
          const cached = yield* lookupSecret(reference)
          if (Option.isSome(cached)) {
            yield* Effect.logDebug(`credential served from the keyring · ref=${reference}`)
            return cached.value
          }
        }
        yield* Effect.logDebug(`credential cache miss · ref=${reference}`)
        const secret = yield* readSecret(reference)
        // The keyring is a cache: a failed store must not break a secret that 1Password just returned.
        yield* storeSecret(reference, secret).pipe(
          Effect.catchTag("KeyringError", (error) =>
            Effect.logWarning(`Could not cache a credential in the keyring: ${error.message}`),
          ),
        )
        return secret
      })
      return Credential.of({
        get: (reference, options) =>
          Effect.provideService(get(reference, options), ChildProcessSpawner, spawner),
      })
    }),
  )
}

export { Credential, type CredentialError, type CredentialShape }
