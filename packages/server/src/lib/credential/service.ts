import { AppPaths } from "@vingroto/core/app-paths"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"

import type { KeyringError } from "@/lib/credential/keyring"

import { lookupSecret, storeSecret } from "@/lib/credential/keyring"

class CredentialNotFound extends Schema.TaggedError<CredentialNotFound>()("CredentialNotFound", {
  reference: Schema.String,
  message: Schema.String,
}) {}

type CredentialError = KeyringError | CredentialNotFound

interface CredentialShape {
  readonly get: (reference: string) => Effect.Effect<string, CredentialError>
  readonly set: (reference: string, secret: string) => Effect.Effect<void, CredentialError>
}

class Credential extends Context.Service<Credential, CredentialShape>()(
  "vingroto/lib/credential/Credential",
) {
  static readonly layer = Layer.effect(
    Credential,
    Effect.gen(function* makeCredential() {
      const paths = yield* AppPaths
      const spawner = yield* ChildProcessSpawner
      const get = Effect.fn("Credential.get")(function* get(reference: string) {
        const cached = yield* lookupSecret(spawner, paths.appName, reference)
        if (Option.isSome(cached)) {
          return cached.value
        }
        yield* Effect.logDebug("credential missing from the keyring").pipe(
          Effect.annotateLogs({ reference }),
        )
        return yield* new CredentialNotFound({
          reference,
          message: `no credentials stored for this account; re-enter them from the account setup`,
        })
      })
      const set = Effect.fn("Credential.set")(function* set(reference: string, secret: string) {
        yield* storeSecret(spawner, paths.appName, reference, secret)
        yield* Effect.logDebug("credential stored in the keyring").pipe(
          Effect.annotateLogs({ reference }),
        )
      })
      return Credential.of({ get, set })
    }),
  )
}

export { Credential, CredentialNotFound, type CredentialError, type CredentialShape }
