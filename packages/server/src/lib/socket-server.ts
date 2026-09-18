import { describeError } from "@vingroto/core/errors"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Socket from "effect/unstable/socket/Socket"
import * as SocketServer from "effect/unstable/socket/SocketServer"

const disconnectTags: ReadonlySet<Socket.SocketErrorReason["_tag"]> = new Set([
  "SocketReadError",
  "SocketWriteError",
  "SocketCloseError",
])

// Effect's RPC socket protocol only treats `SocketCloseError` as a normal close.
// Abrupt disconnects surface as read/write errors that die and get reported as unhandled.
// This wrapper classifies them as a client lifecycle event instead.
const asClientDisconnect = (reason: Cause.Reason<unknown>): Socket.SocketError | undefined => {
  if (!Cause.isDieReason(reason) || !Socket.isSocketError(reason.defect)) {
    return undefined
  }
  const error = reason.defect
  return disconnectTags.has(error.reason._tag) ? error : undefined
}

const disconnectAnnotations = (reason: Socket.SocketErrorReason) => {
  const annotations: Record<string, unknown> = { reason: reason._tag }
  if (reason._tag === "SocketCloseError") {
    annotations.code = reason.code
    if (reason.closeReason !== undefined) {
      annotations.closeReason = reason.closeReason
    }
  } else {
    annotations.cause = describeError(reason.cause)
  }
  return annotations
}

const logDisconnect = (error: Socket.SocketError) =>
  Effect.logDebug("client disconnected").pipe(
    Effect.annotateLogs(disconnectAnnotations(error.reason)),
  )

const asClientDisconnects = (
  cause: Cause.Cause<unknown>,
): readonly Socket.SocketError[] | undefined => {
  const errors: Socket.SocketError[] = []
  for (const reason of cause.reasons) {
    const error = asClientDisconnect(reason)
    if (error === undefined) {
      return undefined
    }
    errors.push(error)
  }
  return errors
}

const wrap =
  <A, E, R>(handler: (socket: Socket.Socket) => Effect.Effect<A, E, R>) =>
  (socket: Socket.Socket) =>
    handler(socket).pipe(
      Effect.catchCause((cause) => {
        const errors = asClientDisconnects(cause)
        if (errors === undefined) {
          return Effect.failCause(cause)
        }
        return Effect.gen(function* logDisconnects() {
          for (const error of errors) {
            yield* logDisconnect(error)
          }
        })
      }),
    )

const SocketServerLayer: Layer.Layer<
  SocketServer.SocketServer,
  SocketServer.SocketServerError,
  SocketServer.SocketServer
> = Layer.effect(
  SocketServer.SocketServer,
  Effect.gen(function* makeSocketServer() {
    const server = yield* SocketServer.SocketServer
    return SocketServer.SocketServer.of({
      address: server.address,
      run: (handler) => server.run(wrap(handler)),
    })
  }),
)

export { SocketServerLayer }
