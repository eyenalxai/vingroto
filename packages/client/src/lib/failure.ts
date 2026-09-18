import * as Data from "effect/Data"

import type { MailClientError } from "@/lib/api"

type ClientFailure = Data.TaggedEnum<{
  server: { readonly message: string }
  connection: { readonly message: string }
  unexpected: { readonly message: string }
}>

const clientFailure = Data.taggedEnum<ClientFailure>()

const connectionReasonTags: ReadonlySet<string> = new Set([
  "SocketCloseError",
  "SocketError",
  "SocketOpenError",
  "SocketReadError",
  "SocketUpgradeError",
  "SocketWriteError",
])

const describeClientFailure = (error: MailClientError): ClientFailure => {
  if (error._tag === "ServerError") {
    return clientFailure.server({ message: error.message })
  }
  if (error._tag === "ClientDefect") {
    return clientFailure.unexpected({ message: error.message })
  }
  if (error.reason._tag === "SocketCloseError") {
    return clientFailure.connection({ message: "the daemon closed the connection" })
  }
  if (error.reason._tag === "SocketReadError") {
    return clientFailure.connection({ message: "the connection to the daemon was lost" })
  }
  if (connectionReasonTags.has(error.reason._tag)) {
    return clientFailure.connection({ message: error.message })
  }
  return clientFailure.unexpected({ message: error.message })
}

export { describeClientFailure, type ClientFailure }
