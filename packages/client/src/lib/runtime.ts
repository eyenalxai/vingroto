import { BunServices, BunSocket } from "@effect/platform-bun"
import { AppPaths } from "@vingroto/core/app-paths"
import { describeError } from "@vingroto/core/errors"
import { LoggingLayer } from "@vingroto/core/logging"
import { ServerRpcs } from "@vingroto/core/protocol/rpc"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as PubSub from "effect/PubSub"
import * as Stream from "effect/Stream"
import { RpcClient, RpcSerialization } from "effect/unstable/rpc"

import { ClientDefect, MailClient } from "@/lib/api"
import { ClientConnection, describeOpenError } from "@/lib/connection"

const ServicesLayer = Layer.mergeAll(AppPaths.layer).pipe(Layer.provideMerge(BunServices.layer))

// The logger is built alongside the services so anything below it logs to the file instead of stdout.
const InfraLayer = Layer.mergeAll(
  ServicesLayer,
  LoggingLayer.client.pipe(Layer.provide(ServicesLayer)),
)

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

// Defects would otherwise kill the calling fiber silently, so the ui can report them as a failure.
const guard = <A, E>(effect: Effect.Effect<A, E>) =>
  effect.pipe(
    Effect.catchDefect((defect) =>
      Effect.fail(new ClientDefect({ message: describeError(defect) })),
    ),
  )

const MailClientLayer = Layer.effect(
  MailClient,
  Effect.gen(function* makeMailClient() {
    const client = yield* RpcClient.make(ServerRpcs)
    return MailClient.of({
      accountUsername: (id) => guard(client.accountUsername({ id })),
      createAccount: (input) => guard(client.createAccount(input)),
      discover: (email) => guard(client.discover({ email })),
      events: client
        .events()
        .pipe(
          Stream.catchDefect((defect) =>
            Stream.fail(new ClientDefect({ message: describeError(defect) })),
          ),
        ),
      mailboxSnapshot: () => guard(client.mailboxSnapshot()),
      getMessage: (id) => guard(client.getMessage({ id })),
      listMessages: (scope, limit) => guard(client.listMessages({ limit, scope })),
      loadBody: (id) => guard(client.loadBody({ id })),
      moveMessages: (ids, targetMailboxId) => guard(client.moveMessages({ ids, targetMailboxId })),
      saveSyncSettings: (settings) => guard(client.saveSyncSettings(settings)),
      setMailboxMuted: (mailboxId, muted) => guard(client.setMailboxMuted({ mailboxId, muted })),
      setSeen: (ids, seen) => guard(client.setSeen({ ids, seen })),
      status: () => guard(client.status()),
      sync: (request) => guard(client.sync(request)),
      updateAccount: (id, input) => guard(client.updateAccount({ id, input })),
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
