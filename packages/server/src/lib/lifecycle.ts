import { AppPaths } from "@vingroto/core/app-paths"
import { describeError } from "@vingroto/core/errors"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import Net from "node:net"

const connectTimeoutMillis = 250

const probeSocket = (socketPath: string) =>
  Effect.callback<boolean>((resume) => {
    const socket = Net.connect(socketPath)
    let settled = false
    const finish = (alive: boolean) => {
      if (settled) {
        return
      }
      settled = true
      socket.destroy()
      resume(Effect.succeed(alive))
    }
    socket.once("connect", () => {
      finish(true)
    })
    socket.once("error", () => {
      finish(false)
    })
    return Effect.sync(() => {
      socket.destroy()
    })
  }).pipe(
    Effect.timeout(connectTimeoutMillis),
    Effect.orElseSucceed(() => false),
  )

class ServerAlreadyRunning extends Schema.TaggedError<ServerAlreadyRunning>()(
  "ServerAlreadyRunning",
  {
    socket: Schema.String,
  },
) {}

interface ServerLifecycleShape {
  readonly socket: string
  readonly startedAt: number
}

class ServerLifecycle extends Context.Service<ServerLifecycle, ServerLifecycleShape>()(
  "vingroto/lib/server/ServerLifecycle",
) {
  static readonly layer = Layer.effect(
    ServerLifecycle,
    Effect.gen(function* makeServerLifecycle() {
      const paths = yield* AppPaths
      const fs = yield* FileSystem.FileSystem
      if (yield* fs.exists(paths.socket)) {
        if (yield* probeSocket(paths.socket)) {
          return yield* new ServerAlreadyRunning({ socket: paths.socket })
        }
        yield* Effect.logInfo("removing a stale server socket").pipe(
          Effect.annotateLogs({ socket: paths.socket }),
        )
        yield* fs.remove(paths.socket)
      }
      yield* Effect.addFinalizer(() =>
        fs
          .remove(paths.socket)
          .pipe(
            Effect.catchTag("PlatformError", (error) =>
              error.reason._tag === "NotFound"
                ? Effect.void
                : Effect.logWarning("could not remove the server socket").pipe(
                    Effect.annotateLogs({ socket: paths.socket, reason: describeError(error) }),
                  ),
            ),
          ),
      )
      const startedAt = yield* Clock.currentTimeMillis
      return ServerLifecycle.of({ socket: paths.socket, startedAt })
    }),
  )
}

export { ServerAlreadyRunning, ServerLifecycle, probeSocket, type ServerLifecycleShape }
