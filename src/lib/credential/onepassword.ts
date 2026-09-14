import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { runProcess } from "@/lib/credential/process"

// The 1Password CLI blocks on an authorization prompt, so reads are bounded by a timeout.
const TIMEOUT = Duration.seconds(90)

class OnePasswordError extends Schema.TaggedError<OnePasswordError>()("OnePasswordError", {
  reference: Schema.String,
  message: Schema.String,
}) {}

const readSecret = Effect.fn("OnePassword.readSecret")(function* read(reference: string) {
  const result = yield* runProcess("op", ["read", reference]).pipe(
    Effect.timeout(TIMEOUT),
    Effect.catchTag("TimeoutError", () =>
      Effect.fail(
        new OnePasswordError({
          reference,
          message: `timed out after ${Duration.toSeconds(TIMEOUT)}s waiting for 1Password; unlock the app and retry`,
        }),
      ),
    ),
    Effect.catchTag("PlatformError", (error) =>
      Effect.fail(new OnePasswordError({ reference, message: error.message })),
    ),
  )
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim()
    return yield* new OnePasswordError({
      reference,
      message: detail === "" ? `op read failed with exit code ${result.exitCode}` : detail,
    })
  }
  const secret = result.stdout.trim()
  if (secret === "") {
    return yield* new OnePasswordError({ reference, message: "1Password returned an empty value" })
  }
  return secret
})

export { OnePasswordError, readSecret }
