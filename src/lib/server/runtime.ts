import { BunServices, BunSocketServer } from "@effect/platform-bun"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { RpcSerialization, RpcServer } from "effect/unstable/rpc"

import { AppPaths } from "@/lib/app-paths"
import { Credential } from "@/lib/credential/service"
import { Database } from "@/lib/db/database"
import { LoggingLayer } from "@/lib/logging"
import { MailActions } from "@/lib/mail/actions"
import { Discovery } from "@/lib/mail/autoconfig"
import { MessageBodies } from "@/lib/mail/bodies"
import { Imap } from "@/lib/mail/imap"
import { MessagePrefetch } from "@/lib/mail/prefetch"
import { SyncEngine } from "@/lib/mail/sync"
import { ServerRpcs } from "@/lib/protocol/rpc"
import { ServerEvents } from "@/lib/server/events"
import { Handlers } from "@/lib/server/handlers"
import { ServerLifecycle } from "@/lib/server/lifecycle"
import { Scheduler } from "@/lib/server/scheduler"

const ServicesLayer = Layer.mergeAll(AppPaths.layer, Credential.layer).pipe(
  Layer.provideMerge(BunServices.layer),
)

const LifecycleLayer = ServerLifecycle.layer.pipe(Layer.provide(ServicesLayer))

// The logger is built alongside the services so anything below it logs to the file instead of stdout.
const InfraLayer = Layer.mergeAll(
  ServicesLayer,
  LifecycleLayer,
  LoggingLayer.pipe(Layer.provide(ServicesLayer)),
)

const CoreLayer = Layer.mergeAll(Database.layer, Imap.layer).pipe(Layer.provideMerge(InfraLayer))

const AppLayer = Layer.mergeAll(
  CoreLayer,
  Discovery.layer,
  MailActions.layer.pipe(Layer.provide(CoreLayer)),
  SyncEngine.layer.pipe(Layer.provide(CoreLayer)),
  MessageBodies.layer.pipe(Layer.provide(CoreLayer)),
  MessagePrefetch.layer.pipe(Layer.provide(CoreLayer)),
)

const EventsLayer = ServerEvents.layer.pipe(Layer.provide(AppLayer))

const SchedulerLayer = Scheduler.layer.pipe(Layer.provide(EventsLayer), Layer.provide(AppLayer))

const HandlersLayer = Handlers.pipe(
  Layer.provide(SchedulerLayer),
  Layer.provide(EventsLayer),
  Layer.provide(AppLayer),
)

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
