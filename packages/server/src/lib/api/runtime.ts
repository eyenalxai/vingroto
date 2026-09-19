import { BunHttpServer } from "@effect/platform-bun"
import * as Cause from "effect/Cause"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { HttpRouter, HttpServer, HttpServerError } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { AccountHandlers } from "@/lib/api/accounts"
import { ServerApi } from "@/lib/api/api"
import { authorizationLayer } from "@/lib/api/authorization"
import { DraftHandlers } from "@/lib/api/drafts"
import { EventHandlers } from "@/lib/api/events"
import { MailboxHandlers } from "@/lib/api/mailboxes"
import { MessageHandlers } from "@/lib/api/messages"
import { notFoundLayer } from "@/lib/api/not-found"
import { OutboxHandlers } from "@/lib/api/outbox"
import { writeRegistration } from "@/lib/api/registration"
import { schemaErrorLayer } from "@/lib/api/schema-error"
import { SearchHandlers } from "@/lib/api/search"
import { ServerHandlers } from "@/lib/api/server"
import { SettingsHandlers } from "@/lib/api/settings"
import { SyncHandlers } from "@/lib/api/sync"
import { readOrCreateToken } from "@/lib/api/token"
import { ServerEvents } from "@/lib/events"

const hostname = "127.0.0.1"
const defaultPort = 8464
const maxPort = 65_535
const maximumBindAttempts = 32

const HandlersLayer = Layer.mergeAll(
  ServerHandlers,
  MailboxHandlers,
  MessageHandlers,
  SearchHandlers,
  AccountHandlers,
  SyncHandlers,
  SettingsHandlers,
  EventHandlers,
  OutboxHandlers,
  DraftHandlers,
)

const appLayer = (token: string) =>
  Layer.merge(
    HttpApiBuilder.layer(ServerApi, { openapiPath: "/openapi.json" }).pipe(
      Layer.provide(HandlersLayer),
      Layer.provide(authorizationLayer(token)),
      Layer.provide(schemaErrorLayer),
    ),
    notFoundLayer,
  )

const bind = (token: string, port: number) =>
  Layer.build(
    HttpRouter.serve(appLayer(token), { disableListenLog: true, disableLogger: true }).pipe(
      Layer.provideMerge(BunHttpServer.layer({ hostname, port })),
    ),
  )

const errorCodeOf = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined
  }
  const code: unknown = error.code
  return typeof code === "string" ? code : undefined
}

const isAddressInUse = (cause: Cause.Cause<unknown>): boolean => {
  const squashed = Cause.squash(cause)
  if (squashed instanceof HttpServerError.ServeError) {
    return errorCodeOf(squashed.cause) === "EADDRINUSE"
  }
  return errorCodeOf(squashed) === "EADDRINUSE"
}

const bindWithFallback = Effect.fnUntraced(function* bindApi(initialPort: number, token: string) {
  const lastPort = Math.min(maxPort, initialPort + maximumBindAttempts - 1)
  let cause: Cause.Cause<unknown> = Cause.die(
    new Error(`no api port was available between ${initialPort} and ${lastPort}`),
  )
  for (let port = initialPort; port <= lastPort; port += 1) {
    const attempt = yield* Effect.exit(bind(token, port))
    if (Exit.isSuccess(attempt)) {
      const server = Context.getOption(attempt.value, HttpServer.HttpServer)
      if (Option.isNone(server)) {
        return yield* Effect.die(new Error("the http server layer did not provide an http server"))
      }
      return server.value
    }
    cause = attempt.cause
    if (!isAddressInUse(cause)) {
      return yield* Effect.failCause(cause).pipe(Effect.orDie)
    }
    if (port < lastPort) {
      yield* Effect.logWarning("api port is unavailable, trying the next one").pipe(
        Effect.annotateLogs({ port }),
      )
    }
  }
  return yield* Effect.failCause(cause).pipe(Effect.orDie)
})

const ApiServer = Layer.effectDiscard(
  Effect.gen(function* makeApiServer() {
    const port = yield* Config.Int("VINGROTO_API_PORT").pipe(Config.withDefault(defaultPort))
    const token = yield* readOrCreateToken()
    const server = yield* bindWithFallback(port, token)
    const address = server.address
    if (address._tag === "InetAddressV4" || address._tag === "InetAddressV6") {
      yield* writeRegistration(address.port)
      const events = yield* ServerEvents
      yield* Effect.addFinalizer(() => events.shutdown())
    } else {
      yield* Effect.die(new Error(`unexpected api address tag ${address._tag}`))
    }
  }),
)

export { ApiServer }
