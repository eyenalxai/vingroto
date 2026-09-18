import { BunServices, BunSocketServer } from "@effect/platform-bun"
import { AppPaths } from "@vingroto/core/app-paths"
import { LoggingLayer } from "@vingroto/core/logging"
import { ServerRpcs } from "@vingroto/core/protocol/rpc"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { RpcSerialization, RpcServer } from "effect/unstable/rpc"

import { Accounts } from "@/lib/accounts"
import { Credential } from "@/lib/credential/service"
import { Database } from "@/lib/db/database"
import { ServerEvents } from "@/lib/events"
import { Handlers } from "@/lib/handlers"
import { ServerLifecycle } from "@/lib/lifecycle"
import { MailActions } from "@/lib/mail/actions"
import { Discovery } from "@/lib/mail/autoconfig"
import { MessageBodies } from "@/lib/mail/bodies"
import { Imap } from "@/lib/mail/imap"
import { MessagePrefetch } from "@/lib/mail/prefetch"
import { SyncEngine } from "@/lib/mail/sync"
import { Scheduler } from "@/lib/scheduler"

const ServicesLayer = Layer.mergeAll(AppPaths.layer, Credential.layer).pipe(
  Layer.provideMerge(BunServices.layer),
)

const LifecycleLayer = ServerLifecycle.layer.pipe(Layer.provide(ServicesLayer))

// The logger is built alongside the services so anything below it logs to the file and stderr.
const InfraLayer = Layer.mergeAll(
  ServicesLayer,
  LifecycleLayer,
  LoggingLayer.server.pipe(Layer.provide(ServicesLayer)),
  ServerEvents.layer,
)

const CoreLayer = Layer.mergeAll(Database.layer, Imap.layer).pipe(Layer.provideMerge(InfraLayer))

const SyncLayer = Layer.mergeAll(SyncEngine.layer, MessagePrefetch.layer).pipe(
  Layer.provide(CoreLayer),
)

const SchedulerLayer = Scheduler.layer.pipe(Layer.provide(SyncLayer), Layer.provide(CoreLayer))

const AppLayer = Layer.mergeAll(
  CoreLayer,
  SyncLayer,
  SchedulerLayer,
  Discovery.layer,
  MailActions.layer.pipe(Layer.provide(CoreLayer)),
  MessageBodies.layer.pipe(Layer.provide(CoreLayer)),
  Accounts.layer.pipe(Layer.provide(SchedulerLayer), Layer.provide(CoreLayer)),
)

const HandlersLayer = Handlers.pipe(Layer.provide(AppLayer))

const SocketServerLayer = Layer.unwrap(
  AppPaths.pipe(Effect.map((paths) => BunSocketServer.layer({ path: paths.socket }))),
)

const ServerRuntime = RpcServer.layer(ServerRpcs, { concurrency: "unbounded" }).pipe(
  Layer.provide(HandlersLayer),
  Layer.provide(RpcServer.layerProtocolSocketServer),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(SocketServerLayer),
  Layer.provide(AppLayer),
)

export { ServerRuntime }
