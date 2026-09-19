import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"

import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { ChildProcess } from "effect/unstable/process"

import { runProcess } from "@/lib/credential/process"

const TIMEOUT = Duration.seconds(30)

class KeyringError extends Schema.TaggedError<KeyringError>()("KeyringError", {
  operation: Schema.Literals(["lookup", "store"]),
  message: Schema.String,
}) {}

const timedOut = (operation: "lookup" | "store") =>
  new KeyringError({
    operation,
    message: `keyring ${operation} timed out after ${Duration.toSeconds(TIMEOUT)}s (is the keyring unlocked?)`,
  })

const lookupSecret = Effect.fn("Keyring.lookupSecret")(function* lookup(
  spawner: ChildProcessSpawner["Service"],
  service: string,
  reference: string,
) {
  const result = yield* runProcess(spawner, "secret-tool", [
    "lookup",
    "service",
    service,
    "ref",
    reference,
  ]).pipe(
    Effect.timeout(TIMEOUT),
    Effect.catchTag("TimeoutError", () => Effect.fail(timedOut("lookup"))),
    Effect.catchTag("PlatformError", (error) =>
      Effect.fail(new KeyringError({ operation: "lookup", message: error.message })),
    ),
  )
  if (result.exitCode === 0) {
    const value = result.stdout.trim()
    return Option.liftPredicate(value, (input) => input.length > 0)
  }
  // Secret-tool exits 1 when no item matches the queried attributes.
  if (result.exitCode === 1) {
    return Option.none<string>()
  }
  return yield* new KeyringError({
    operation: "lookup",
    message: `secret-tool lookup failed with exit code ${result.exitCode}: ${result.stderr.trim()}`,
  })
})

const storeSecret = Effect.fn("Keyring.storeSecret")(function* store(
  spawner: ChildProcessSpawner["Service"],
  service: string,
  reference: string,
  secret: string,
) {
  const exitCode = yield* Effect.gen(function* storeInKeyring() {
    const handle = yield* spawner.spawn(
      ChildProcess.make("secret-tool", [
        "store",
        "--label",
        `${service}: ${reference}`,
        "service",
        service,
        "ref",
        reference,
      ]),
    )
    yield* Stream.make(secret).pipe(Stream.encodeText, Stream.run(handle.stdin))
    return yield* handle.exitCode
  }).pipe(
    Effect.scoped,
    Effect.timeout(TIMEOUT),
    Effect.catchTag("TimeoutError", () => Effect.fail(timedOut("store"))),
    Effect.catchTag("PlatformError", (error) =>
      Effect.fail(new KeyringError({ operation: "store", message: error.message })),
    ),
  )
  if (exitCode !== 0) {
    yield* new KeyringError({
      operation: "store",
      message: `secret-tool store failed with exit code ${exitCode}`,
    })
  }
})

export { KeyringError, lookupSecret, storeSecret }
