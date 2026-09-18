import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"

import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Stream from "effect/Stream"
import { ChildProcess } from "effect/unstable/process"

interface ProcessOutput {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

// Both streams are drained concurrently so a chatty child cannot deadlock on a full pipe buffer.
const runProcess = (
  spawner: ChildProcessSpawner["Service"],
  command: string,
  args: readonly string[],
) =>
  Effect.scoped(
    Effect.gen(function* execute() {
      const handle = yield* spawner.spawn(ChildProcess.make(command, args))
      const stdout = yield* Effect.forkScoped(
        handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
      )
      const stderr = yield* Effect.forkScoped(
        handle.stderr.pipe(Stream.decodeText(), Stream.mkString),
      )
      const exitCode = yield* handle.exitCode
      return {
        exitCode,
        stdout: yield* Fiber.join(stdout),
        stderr: yield* Fiber.join(stderr),
      }
    }),
  )

export { runProcess, type ProcessOutput }
