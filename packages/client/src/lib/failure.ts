import { describeError } from "@vingroto/core/errors"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"

import type { MailClientError } from "@/lib/api"
import type { DaemonError } from "@/lib/daemon"

import { describeOpenError } from "@/lib/connection"

type ClientFailure = Data.TaggedEnum<{
  server: { readonly message: string }
  connection: { readonly message: string }
  unexpected: { readonly message: string }
}>

const clientFailure = Data.taggedEnum<ClientFailure>()

const daemonErrorTags = {
  DaemonEnvironmentUnreadable: true,
  DaemonNotRunning: true,
  DaemonRegistrationInvalid: true,
  DaemonTokenUnreadable: true,
} as const satisfies Record<DaemonError["_tag"], true>

const isDaemonError = (error: MailClientError): error is DaemonError =>
  Object.hasOwn(daemonErrorTags, error._tag)

const describeClientFailure = (error: MailClientError): ClientFailure => {
  if (error._tag === "ClientDefect") {
    return clientFailure.unexpected({ message: `${error.operation}: ${error.message}` })
  }
  if (error._tag === "HttpClientError") {
    if (error.reason._tag === "TransportError" || error.reason._tag === "InvalidUrlError") {
      return clientFailure.connection({ message: describeOpenError(error) })
    }
    if (error.reason._tag === "EncodeError") {
      return clientFailure.unexpected({ message: error.message })
    }
    return clientFailure.server({ message: error.message })
  }
  if (isDaemonError(error)) {
    return clientFailure.connection({ message: describeOpenError(error) })
  }
  return clientFailure.server({ message: error.message })
}

interface FailureHandlers {
  readonly onStatus: (message: string) => void
  readonly onDisconnected: (message: string) => void
}

const reportClientFailure = (label: string, error: MailClientError, handlers: FailureHandlers) => {
  const failure = describeClientFailure(error)
  handlers.onStatus(`${label} · ${failure.message}`)
  if (failure._tag === "connection") {
    handlers.onDisconnected(failure.message)
  }
}

// Why: defects never reach the typed error channel, so without this the forked fiber dies silently.
// The defect is observed and preserved, not swallowed.
const reportDefects =
  (operation: string, onUnexpected: (message: string) => void) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    effect.pipe(
      Effect.tapDefect((defect) =>
        Effect.sync(() => {
          onUnexpected(`${operation} · ${describeError(defect)}`)
        }),
      ),
    )

export { describeClientFailure, reportClientFailure, reportDefects, type ClientFailure }
