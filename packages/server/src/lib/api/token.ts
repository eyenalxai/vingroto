import { AppPaths } from "@vingroto/core/app-paths"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as Encoding from "effect/Encoding"
import * as FileSystem from "effect/FileSystem"

const tokenBytes = 32

const readOrCreateToken = Effect.fn("ApiToken.readOrCreate")(function* readOrCreateToken() {
  const paths = yield* AppPaths
  const fs = yield* FileSystem.FileSystem
  const exists = yield* fs.exists(paths.token)
  if (exists) {
    const stored = (yield* fs.readFileString(paths.token)).trim()
    if (stored.length > 0) {
      return stored
    }
  }
  const crypto = yield* Crypto.Crypto
  const token = Encoding.encodeBase64Url(yield* crypto.randomBytes(tokenBytes))
  const temporary = `${paths.token}.tmp`
  yield* fs.writeFileString(temporary, token, { mode: 0o600 })
  yield* fs.rename(temporary, paths.token)
  yield* Effect.logInfo("api token created").pipe(Effect.annotateLogs({ path: paths.token }))
  return token
})

export { readOrCreateToken }
