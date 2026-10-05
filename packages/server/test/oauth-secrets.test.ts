import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

import type { Credential, CredentialError } from "@/lib/credential/service"

import { KeyringError } from "@/lib/credential/keyring"
import { CredentialNotFound } from "@/lib/credential/service"
import { readOptionalSecret } from "@/lib/oauth/secrets"

const reference = "vingroto-test/secret"

const credentialFor = (get: Effect.Effect<string, CredentialError>): Credential["Service"] => ({
  get: () => get,
  set: () => Effect.void,
})

describe("readOptionalSecret", () => {
  test("a stored secret is returned", async () => {
    const secret = await Effect.runPromise(
      readOptionalSecret(credentialFor(Effect.succeed("stored-secret")), reference),
    )
    expect(secret).toEqual(Option.some("stored-secret"))
  })

  test("a missing secret is none rather than a failure", async () => {
    const secret = await Effect.runPromise(
      readOptionalSecret(
        credentialFor(
          Effect.fail(new CredentialNotFound({ reference, message: "no credentials stored" })),
        ),
        reference,
      ),
    )
    expect(Option.isNone(secret)).toBe(true)
  })

  test("a keyring failure becomes an authorization failure", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        readOptionalSecret(
          credentialFor(
            Effect.fail(
              new KeyringError({ operation: "lookup", message: "the keyring is locked" }),
            ),
          ),
          reference,
        ),
      ),
    )
    expect(error._tag).toBe("OAuthAuthorizationFailed")
    expect(error.message).toBe("the OS keyring could not be read: the keyring is locked")
  })
})
