import type { MailClientError } from "@/lib/client/api"

type ClientFailure =
  | { readonly _tag: "server"; readonly message: string }
  | { readonly _tag: "connection"; readonly message: string }

const describeClientFailure = (error: MailClientError): ClientFailure => {
  if (error._tag === "ServerError") {
    return { _tag: "server", message: error.message }
  }
  if (error.reason._tag === "SocketCloseError") {
    return { _tag: "connection", message: "the daemon closed the connection" }
  }
  if (error.reason._tag === "SocketReadError") {
    return { _tag: "connection", message: "the connection to the daemon was lost" }
  }
  return { _tag: "connection", message: error.message }
}

export { describeClientFailure, type ClientFailure }
