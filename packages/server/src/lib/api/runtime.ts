import { BunHttpServer } from "@effect/platform-bun"
import * as Cause from "effect/Cause"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { AccountHandlers } from "@/lib/api/accounts"
import { ServerApi } from "@/lib/api/api"
import { authorizationLayer } from "@/lib/api/authorization"
import { EventHandlers } from "@/lib/api/events"
import { MailboxHandlers } from "@/lib/api/mailboxes"
import { MessageHandlers } from "@/lib/api/messages"
import { writeRegistration } from "@/lib/api/registration"
import { schemaErrorLayer } from "@/lib/api/schema-error"
import { ServerHandlers } from "@/lib/api/server"
import { SettingsHandlers } from "@/lib/api/settings"
import { SyncHandlers } from "@/lib/api/sync"
import { readOrCreateToken } from "@/lib/api/token"

const hostname = "127.0.0.1"
const defaultPort = 8464
const maxPort = 65_535

const HandlersLayer = Layer.mergeAll(
  ServerHandlers,
  MailboxHandlers,
  MessageHandlers,
  AccountHandlers,
  SyncHandlers,
  SettingsHandlers,
  EventHandlers,
)

const apiLayer = (token: string) =>
  HttpApiBuilder.layer(ServerApi, { openapiPath: "/openapi.json" }).pipe(
    Layer.provide(HandlersLayer),
    Layer.provide(authorizationLayer(token)),
    Layer.provide(schemaErrorLayer),
  )

const bind = (token: string, port: number) =>
  Layer.build(
    HttpRouter.serve(apiLayer(token), { disableListenLog: true, disableLogger: true }).pipe(
      Layer.provideMerge(BunHttpServer.layer({ hostname, port })),
    ),
  )

const bindWithFallback = Effect.fnUntraced(function* bindApi(initialPort: number, token: string) {
  let cause: Cause.Cause<unknown> = Cause.die(new Error("no api port was available"))
  for (let port = initialPort; port <= maxPort; port += 1) {
    const attempt = yield* Effect.exit(bind(token, port))
    if (Exit.isSuccess(attempt)) {
      return Context.getUnsafe(attempt.value, HttpServer.HttpServer)
    }
    cause = attempt.cause
    if (port < maxPort) {
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
    if (address._tag !== "InetAddressV4" && address._tag !== "InetAddressV6") {
      return yield* Effect.die(new Error(`unexpected api address tag ${address._tag}`))
    }
    return yield* writeRegistration(address.port)
  }),
)

export { ApiServer }
