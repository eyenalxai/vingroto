import { BunServices } from "@effect/platform-bun"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"

import { AppPaths } from "@/lib/app-paths"
import { Credential } from "@/lib/credential/service"
import { Database } from "@/lib/db/database"
import { LoggingLayer } from "@/lib/logging"
import { MessageBodies } from "@/lib/mail/bodies"
import { Imap } from "@/lib/mail/imap"
import { MessagePrefetch } from "@/lib/mail/prefetch"
import { SyncEngine } from "@/lib/mail/sync"

const ServicesLayer = Layer.mergeAll(AppPaths.layer, Credential.layer).pipe(
  Layer.provideMerge(BunServices.layer),
)

// The logger is built alongside the services so anything below it logs to the file instead of stdout.
const InfraLayer = Layer.mergeAll(ServicesLayer, LoggingLayer.pipe(Layer.provide(ServicesLayer)))

const CoreLayer = Layer.mergeAll(Database.layer, Imap.layer).pipe(Layer.provideMerge(InfraLayer))

const VingrotoLayer = Layer.mergeAll(
  CoreLayer,
  SyncEngine.layer.pipe(Layer.provide(CoreLayer)),
  MessageBodies.layer.pipe(Layer.provide(CoreLayer)),
  MessagePrefetch.layer.pipe(Layer.provide(CoreLayer)),
)

const createAppRuntime = () => ManagedRuntime.make(VingrotoLayer)

type AppRuntime = ReturnType<typeof createAppRuntime>

export { createAppRuntime, VingrotoLayer, type AppRuntime }
