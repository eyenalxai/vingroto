import type { ServerStatus } from "@vingroto/core/protocol/accounts"

import { Effect, Fiber, Stream } from "effect"
import { createEffect, createSignal, onCleanup } from "solid-js"

import type { AppRuntime } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { ClientConnection } from "@/lib/connection"
import { describeClientFailure, reportDefects } from "@/lib/failure"
import { isTransientFailure, retryTransientFailures } from "@/lib/retry"

const useDaemonStatus = (runtime: AppRuntime) => {
  const [status, setStatus] = createSignal<ServerStatus | undefined>()
  const [failure, setFailure] = createSignal<string | undefined>()
  const [endpoint, setEndpoint] = createSignal<string | undefined>()
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
    const program = Effect.gen(function* watchEndpoint() {
      const connection = yield* ClientConnection
      yield* connection.endpoint.pipe(
        Stream.runForEach((value) =>
          Effect.sync(() => {
            setEndpoint(value)
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
      yield* retryTransientFailures(
        client.status().pipe(
          Effect.tap((nextStatus) =>
            Effect.sync(() => {
              setStatus(nextStatus)
              setFailure(undefined)
            }),
          ),
        ),
        {
          isTransient: isTransientFailure,
          onFailure: (error) => {
            setFailure(describeClientFailure(error).message)
          },
        },
      )
    }).pipe(
      reportDefects("could not load the daemon status", (message) => {
        setFailure(message)
      }),
    )
    const fiber = runtime.runFork(program)
    onCleanup(() => {
      runtime.runFork(Fiber.interrupt(fiber))
    })
  })

  const retry = (message: string) => {
    setFailure(message)
    setGeneration((value) => value + 1)
  }

  const refresh = Effect.gen(function* refetchStatus() {
    const client = yield* MailClient
    const result = yield* client.status().pipe(Effect.result)
    if (result._tag === "Success") {
      yield* Effect.sync(() => {
        setStatus(result.success)
        setFailure(undefined)
      })
      return
    }
    yield* Effect.sync(() => {
      setFailure(describeClientFailure(result.failure).message)
    })
  })

  return { endpoint, failure, refresh, retry, status }
}

export { useDaemonStatus }
