import { AppPaths } from "@vingroto/core/app-paths"
import { describeError } from "@vingroto/core/errors"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import path from "node:path"

class ServerAlreadyRunning extends Schema.TaggedError<ServerAlreadyRunning>()(
  "ServerAlreadyRunning",
  {
    lock: Schema.String,
    message: Schema.String,
  },
) {}

interface ServerLifecycleShape {
  readonly startedAt: number
}

const isProcessAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (
      Predicate.isError(error) && Predicate.hasProperty(error, "code") && error.code === "EPERM"
    )
  }
}

const readLockPid = (fs: FileSystem.FileSystem, lock: string) =>
  fs.readFileString(path.join(lock, "pid")).pipe(
    Effect.map((raw) => Math.trunc(Number(raw.trim()))),
    // A lock directory without a pid file is stale; any other read failure must stay visible.
    Effect.catchTag("PlatformError", (error) =>
      error.reason._tag === "NotFound" ? Effect.succeed(Number.NaN) : Effect.fail(error),
    ),
  )

const removeLock = (fs: FileSystem.FileSystem, lock: string) =>
  fs
    .remove(lock, { recursive: true, force: true })
    .pipe(
      Effect.catchTag("PlatformError", (error) =>
        Effect.logWarning("could not remove the server lock").pipe(
          Effect.annotateLogs({ lock, reason: describeError(error) }),
        ),
      ),
    )

class ServerLifecycle extends Context.Service<ServerLifecycle, ServerLifecycleShape>()(
  "@vingroto/server/lib/lifecycle/ServerLifecycle",
) {
  static readonly layer = Layer.effect(
    ServerLifecycle,
    Effect.gen(function* makeServerLifecycle() {
      const paths = yield* AppPaths
      const fs = yield* FileSystem.FileSystem
      const acquireLock = Effect.fnUntraced(function* acquireLock() {
        while (true) {
          const created = yield* fs.makeDirectory(paths.lock).pipe(
            Effect.as(true),
            Effect.catchTag("PlatformError", (error) =>
              error.reason._tag === "AlreadyExists" ? Effect.succeed(false) : Effect.fail(error),
            ),
          )
          if (created) {
            return yield* Effect.void
          }
          const pid = yield* readLockPid(fs, paths.lock)
          if (Number.isSafeInteger(pid) && pid > 0 && isProcessAlive(pid)) {
            return yield* new ServerAlreadyRunning({
              lock: paths.lock,
              message: `another vingroto server is already running with pid ${pid}`,
            })
          }
          yield* Effect.logInfo("removing a stale server lock").pipe(
            Effect.annotateLogs({ lock: paths.lock }),
          )
          yield* removeLock(fs, paths.lock)
        }
      })
      yield* acquireLock()
      yield* Effect.addFinalizer(() => removeLock(fs, paths.lock))
      yield* fs.writeFileString(path.join(paths.lock, "pid"), `${process.pid}\n`)
      const startedAt = yield* Clock.currentTimeMillis
      return ServerLifecycle.of({ startedAt })
    }),
  )
}

export { ServerAlreadyRunning, ServerLifecycle, type ServerLifecycleShape }
