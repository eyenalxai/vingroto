import type { AppPathsShape } from "@vingroto/core/app-paths"
import type * as FileSystem from "effect/FileSystem"
import type { PlatformError } from "effect/PlatformError"

import { describeError } from "@vingroto/core/errors"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

const Registration = Schema.Struct({ url: Schema.String })

class DaemonNotRunning extends Schema.TaggedError<DaemonNotRunning>()("DaemonNotRunning", {
  path: Schema.String,
}) {
  override get message() {
    return `the vingroto daemon is not running: no registration file at ${this.path}; start it or pass --server`
  }
}

class DaemonRegistrationInvalid extends Schema.TaggedError<DaemonRegistrationInvalid>()(
  "DaemonRegistrationInvalid",
  {
    path: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message() {
    return `the vingroto daemon registration at ${this.path} is invalid: ${describeError(this.cause)}`
  }
}

class DaemonTokenUnreadable extends Schema.TaggedError<DaemonTokenUnreadable>()(
  "DaemonTokenUnreadable",
  {
    path: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message() {
    return `could not read the vingroto daemon token at ${this.path}: ${describeError(this.cause)}; pass --token or set VINGROTO_TOKEN`
  }
}

class DaemonEnvironmentUnreadable extends Schema.TaggedError<DaemonEnvironmentUnreadable>()(
  "DaemonEnvironmentUnreadable",
  {
    name: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message() {
    return `could not read the environment variable ${this.name}: ${describeError(this.cause)}`
  }
}

type DaemonError =
  | DaemonNotRunning
  | DaemonRegistrationInvalid
  | DaemonTokenUnreadable
  | DaemonEnvironmentUnreadable

interface DaemonTarget {
  readonly url: string
  readonly token: string
}

interface DaemonEnvironment {
  readonly paths: AppPathsShape
  readonly fs: FileSystem.FileSystem
}

interface ResolveDaemonOptions {
  readonly server?: string | undefined
  readonly token?: string | undefined
}

const isNotFound = (error: PlatformError) => error.reason._tag === "NotFound"

const readRegistration = Effect.fnUntraced(function* readRegistration(
  fs: FileSystem.FileSystem,
  path: string,
) {
  const raw = yield* fs
    .readFileString(path)
    .pipe(
      Effect.catchTag("PlatformError", (error) =>
        Effect.fail(
          isNotFound(error)
            ? new DaemonNotRunning({ path })
            : new DaemonRegistrationInvalid({ path, cause: error }),
        ),
      ),
    )
  return yield* Schema.decodeEffect(Schema.fromJsonString(Registration))(raw).pipe(
    Effect.mapError((cause) => new DaemonRegistrationInvalid({ path, cause })),
  )
})

const readToken = Effect.fnUntraced(function* readToken(fs: FileSystem.FileSystem, path: string) {
  const raw = yield* fs
    .readFileString(path)
    .pipe(
      Effect.catchTag("PlatformError", (error) =>
        Effect.fail(new DaemonTokenUnreadable({ path, cause: error })),
      ),
    )
  const token = raw.trim()
  if (token.length === 0) {
    return yield* new DaemonTokenUnreadable({ path, cause: "the token file is empty" })
  }
  return token
})

const readEnvironment = Effect.fnUntraced(function* readEnvironment(name: string) {
  return yield* Config.option(Config.String(name)).pipe(
    Effect.mapError((cause) => new DaemonEnvironmentUnreadable({ name, cause })),
  )
})

const resolveDaemon = Effect.fn("Daemon.resolve")(function* resolveDaemon(
  environment: DaemonEnvironment,
  options: ResolveDaemonOptions,
) {
  const envServer = yield* readEnvironment("VINGROTO_SERVER")
  const envToken = yield* readEnvironment("VINGROTO_TOKEN")
  const server = options.server ?? Option.getOrUndefined(envServer)
  const token = options.token ?? Option.getOrUndefined(envToken)
  const url =
    server ?? (yield* readRegistration(environment.fs, environment.paths.registration)).url
  const value = token ?? (yield* readToken(environment.fs, environment.paths.token))
  return { url, token: value }
})

export {
  DaemonEnvironmentUnreadable,
  DaemonNotRunning,
  DaemonRegistrationInvalid,
  DaemonTokenUnreadable,
  resolveDaemon,
  type DaemonError,
  type DaemonTarget,
  type ResolveDaemonOptions,
}
