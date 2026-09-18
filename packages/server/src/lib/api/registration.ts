import { AppPaths } from "@vingroto/core/app-paths"
import { describeError } from "@vingroto/core/errors"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Schema from "effect/Schema"

import { readVersion } from "@/lib/status"

const Registration = Schema.Struct({
  url: Schema.String,
  pid: Schema.Int,
  version: Schema.String,
})

const registrationJson = Schema.fromJsonString(Registration, { space: 2 })

const removeRegistration = (path: string, fs: FileSystem.FileSystem) =>
  fs
    .remove(path)
    .pipe(
      Effect.catchTag("PlatformError", (error) =>
        error.reason._tag === "NotFound"
          ? Effect.void
          : Effect.logWarning("could not remove the api registration").pipe(
              Effect.annotateLogs({ path, reason: describeError(error) }),
            ),
      ),
    )

const writeRegistration = Effect.fn("ApiRegistration.write")(function* writeRegistration(
  port: number,
) {
  const paths = yield* AppPaths
  const fs = yield* FileSystem.FileSystem
  const version = yield* readVersion()
  const url = `http://127.0.0.1:${port}`
  const content = yield* Schema.encodeEffect(registrationJson)({
    url,
    pid: process.pid,
    version,
  })
  const temporary = `${paths.registration}.tmp`
  yield* fs.writeFileString(temporary, `${content}\n`, { mode: 0o600 })
  yield* fs.rename(temporary, paths.registration)
  yield* Effect.addFinalizer(() => removeRegistration(paths.registration, fs))
  yield* Effect.logInfo("api registration written").pipe(
    Effect.annotateLogs({ url, pid: process.pid, version }),
  )
})

export { writeRegistration }
