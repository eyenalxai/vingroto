import * as Data from "effect/Data"

import type { MailClientError } from "@/lib/api"
import type { DaemonError } from "@/lib/daemon"

import { describeOpenError } from "@/lib/connection"

type ClientFailure = Data.TaggedEnum<{
  server: { readonly message: string }
  connection: { readonly message: string }
  unexpected: { readonly message: string }
}>

const clientFailure = Data.taggedEnum<ClientFailure>()

const daemonFailureTags: ReadonlySet<string> = new Set([
  "DaemonEnvironmentUnreadable",
  "DaemonNotRunning",
  "DaemonRegistrationInvalid",
  "DaemonTokenUnreadable",
])

const isDaemonError = (error: MailClientError): error is DaemonError =>
  daemonFailureTags.has(error._tag)

const describeClientFailure = (error: MailClientError): ClientFailure => {
  if (error._tag === "ClientDefect") {
    return clientFailure.unexpected({ message: error.message })
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

export { describeClientFailure, reportClientFailure, type ClientFailure }
