import type { Stream } from "effect"
import type { RpcClientError } from "effect/unstable/rpc"

import * as Context from "effect/Context"

import { describeError } from "@/lib/errors"

interface ClientConnectionShape {
  readonly openErrors: Stream.Stream<string>
}

// The rpc transport retries open errors silently, so the latest failure is published here for the ui.
class ClientConnection extends Context.Service<ClientConnection, ClientConnectionShape>()(
  "vingroto/lib/client/ClientConnection",
) {}

const describeOpenError = (error: RpcClientError.RpcClientError): string => {
  if (error.reason._tag === "SocketOpenError") {
    return `could not connect to the daemon · ${describeError(error.reason.cause)}`
  }
  return error.message
}

export { ClientConnection, describeOpenError, type ClientConnectionShape }
