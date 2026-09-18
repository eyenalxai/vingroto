import type { Stream } from "effect"
import type { HttpClientError } from "effect/unstable/http"

import { describeError } from "@vingroto/core/errors"
import * as Context from "effect/Context"

import type { DaemonError } from "@/lib/daemon"

interface ClientConnectionShape {
  readonly endpoint: Stream.Stream<string | undefined>
  readonly openErrors: Stream.Stream<string>
}

// Connection failures are published here so the ui can show the latest one while requests retry.
class ClientConnection extends Context.Service<ClientConnection, ClientConnectionShape>()(
  "vingroto/lib/client/ClientConnection",
) {}

const describeOpenError = (error: HttpClientError.HttpClientError | DaemonError): string => {
  if (error._tag === "HttpClientError") {
    if (error.reason._tag === "TransportError") {
      return `could not connect to the daemon · ${describeError(error.reason.cause ?? error.reason)}`
    }
    return error.message
  }
  return `could not connect to the daemon · ${error.message}`
}

export { ClientConnection, describeOpenError, type ClientConnectionShape }
