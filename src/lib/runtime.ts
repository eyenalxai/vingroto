import { BunServices } from "@effect/platform-bun"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"

import { AppPaths } from "@/lib/app-paths"
import { Credential } from "@/lib/credential/service"
import { Database } from "@/lib/db/database"
import { LoggingLayer } from "@/lib/logging"
import { Imap } from "@/lib/mail/imap"
import { SyncEngine } from "@/lib/mail/sync"

const ServicesLayer = Layer.mergeAll(AppPaths.layer, Credential.layer).pipe(
  Layer.provideMerge(BunServices.layer),
)

const CoreLayer = Layer.mergeAll(Database.layer, Imap.layer).pipe(Layer.provideMerge(ServicesLayer))

const VingrotoLayer = Layer.mergeAll(
  CoreLayer,
  SyncEngine.layer.pipe(Layer.provide(CoreLayer)),
  LoggingLayer.pipe(Layer.provide(CoreLayer)),
)

const createAppRuntime = () => ManagedRuntime.make(VingrotoLayer)

type AppRuntime = ReturnType<typeof createAppRuntime>

export { createAppRuntime, VingrotoLayer, type AppRuntime }
