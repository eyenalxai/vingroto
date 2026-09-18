import { BunServices } from "@effect/platform-bun"
import { AppPaths } from "@vingroto/core/app-paths"
import { LoggingLayer } from "@vingroto/core/logging"
import * as Layer from "effect/Layer"

import { Accounts } from "@/lib/accounts"
import { ApiServer } from "@/lib/api/runtime"
import { Credential } from "@/lib/credential/service"
import { Database } from "@/lib/db/database"
import { ServerEvents } from "@/lib/events"
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

const ServerRuntime = ApiServer.pipe(Layer.provide(AppLayer))

export { ServerRuntime }
