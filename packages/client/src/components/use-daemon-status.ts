import type { ServerStatus } from "@vingroto/core/protocol/accounts"

import { AppPaths } from "@vingroto/core/app-paths"
import { describeError } from "@vingroto/core/errors"
import { Duration, Effect, Fiber, Stream } from "effect"
import { createEffect, createResource, createSignal, onCleanup } from "solid-js"

import type { AppRuntime } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { ClientConnection } from "@/lib/connection"

const retryInitialDelayMs = 250
const retryMaximumDelayMs = 5000

const useDaemonStatus = (runtime: AppRuntime) => {
  const [status, setStatus] = createSignal<ServerStatus | undefined>()
  const [failure, setFailure] = createSignal<string | undefined>()
  const [generation, setGeneration] = createSignal(0)

  createEffect(() => {
    const program = Effect.gen(function* watchOpenErrors() {
      const connection = yield* ClientConnection
      yield* connection.openErrors.pipe(
        Stream.runForEach((message) =>
          Effect.sync(() => {
            setFailure(message)
          }),
        ),
      )
    })
    const fiber = runtime.runFork(program)
    onCleanup(() => {
      runtime.runFork(Fiber.interrupt(fiber))
    })
  })

  createEffect(() => {
    generation()
    const program = Effect.gen(function* pollStatus() {
      const client = yield* MailClient
      let delay = retryInitialDelayMs
      while (true) {
        const result = yield* client.status().pipe(Effect.result)
        if (result._tag === "Success") {
          yield* Effect.sync(() => {
            setStatus(result.success)
            setFailure(undefined)
          })
          return
        }
        yield* Effect.sync(() => {
          setStatus(undefined)
          setFailure(describeError(result.failure))
        })
        yield* Effect.sleep(Duration.millis(delay))
        delay = Math.min(delay * 2, retryMaximumDelayMs)
      }
    })
    const fiber = runtime.runFork(program)
    onCleanup(() => {
      runtime.runFork(Fiber.interrupt(fiber))
    })
  })

  const [socket] = createResource(async () =>
    runtime.runPromise(
      Effect.gen(function* resolveSocketPath() {
        const paths = yield* AppPaths
        return paths.socket
      }),
    ),
  )

  const retry = (message: string) => {
    setStatus(undefined)
    setFailure(message)
    setGeneration((value) => value + 1)
  }

  const refresh = async () => {
    await runtime.runPromise(
      Effect.gen(function* refetchStatus() {
        const client = yield* MailClient
        const result = yield* client.status().pipe(Effect.result)
        if (result._tag === "Success") {
          setStatus(result.success)
          setFailure(undefined)
          return
        }
        setStatus(undefined)
        setFailure(describeError(result.failure))
      }),
    )
  }

  return { failure, refresh, retry, socket, status }
}

export { useDaemonStatus }
