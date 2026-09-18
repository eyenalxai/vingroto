import { BunServices, BunSocket } from "@effect/platform-bun"
import { AppPaths } from "@vingroto/core/app-paths"
import { LoggingLayer } from "@vingroto/core/logging"
import { ServerRpcs } from "@vingroto/core/protocol/rpc"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as PubSub from "effect/PubSub"
import * as Stream from "effect/Stream"
import { RpcClient, RpcSerialization } from "effect/unstable/rpc"

import { MailClient } from "@/lib/api"
import { ClientConnection, describeOpenError } from "@/lib/connection"

const ServicesLayer = Layer.mergeAll(AppPaths.layer).pipe(Layer.provideMerge(BunServices.layer))

// The logger is built alongside the services so anything below it logs to the file instead of stdout.
const InfraLayer = Layer.mergeAll(ServicesLayer, LoggingLayer.pipe(Layer.provide(ServicesLayer)))

const SocketLayer = Layer.unwrap(
  AppPaths.pipe(Effect.map((paths) => BunSocket.layerNet({ path: paths.socket }))),
)

const ConnectionLayer = Layer.unwrap(
  Effect.gen(function* makeConnection() {
    const openErrors = yield* PubSub.unbounded<string>()
    const protocol = Layer.effect(
      RpcClient.Protocol,
      RpcClient.makeProtocolSocket({
        onTransientError: (error) =>
          PubSub.publish(openErrors, describeOpenError(error)).pipe(Effect.asVoid),
        retryTransientErrors: true,
      }),
    )
    const connection = Layer.succeed(ClientConnection, {
      openErrors: Stream.fromPubSub(openErrors),
    })
    return Layer.merge(protocol, connection)
  }),
)

const MailClientLayer = Layer.effect(
  MailClient,
  Effect.gen(function* makeMailClient() {
    const client = yield* RpcClient.make(ServerRpcs)
    return MailClient.of({
      accountUsername: (id) => client.accountUsername({ id }),
      createAccount: (input) => client.createAccount(input),
      discover: (email) => client.discover({ email }),
      events: client.events(),
      folderSnapshot: () => client.folderSnapshot(),
      getMessage: (id) => client.getMessage({ id }),
      listMessages: (scope, limit) => client.listMessages({ limit, scope }),
      loadBody: (id) => client.loadBody({ id }),
      moveMessages: (ids, targetMailboxId) => client.moveMessages({ ids, targetMailboxId }),
      saveSyncSettings: (settings) => client.saveSyncSettings(settings),
      setMailboxMuted: (mailboxId, muted) => client.setMailboxMuted({ mailboxId, muted }),
      setSeen: (ids, seen) => client.setSeen({ ids, seen }),
      status: () => client.status(),
      sync: (request) => client.sync(request),
      updateAccount: (id, input) => client.updateAccount({ id, input }),
    })
  }),
)

const ClientLayer = MailClientLayer.pipe(
  Layer.provideMerge(ConnectionLayer),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(SocketLayer),
  Layer.provideMerge(InfraLayer),
)

const createClientRuntime = () => ManagedRuntime.make(ClientLayer)

type AppRuntime = ReturnType<typeof createClientRuntime>

export { createClientRuntime, type AppRuntime }
