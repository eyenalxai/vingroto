import type { MailClientError } from "@/lib/api"

type ClientFailure =
  | { readonly _tag: "server"; readonly message: string }
  | { readonly _tag: "connection"; readonly message: string }
  | { readonly _tag: "unexpected"; readonly message: string }

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
    return { _tag: "server", message: error.message }
  }
  if (error._tag === "ClientDefect") {
    return { _tag: "unexpected", message: error.message }
  }
  if (error.reason._tag === "SocketCloseError") {
    return { _tag: "connection", message: "the daemon closed the connection" }
  }
  if (error.reason._tag === "SocketReadError") {
    return { _tag: "connection", message: "the connection to the daemon was lost" }
  }
  if (connectionReasonTags.has(error.reason._tag)) {
    return { _tag: "connection", message: error.message }
  }
  return { _tag: "unexpected", message: error.message }
}

export { describeClientFailure, type ClientFailure }
