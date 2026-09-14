import { BunServices } from "@effect/platform-bun"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"

import { AppPaths } from "@/lib/app-paths"
import { Credential } from "@/lib/credential/service"
import { Database } from "@/lib/db/database"

const ServicesLayer = Layer.mergeAll(AppPaths.layer, Credential.layer).pipe(
  Layer.provideMerge(BunServices.layer),
)

const VingrotoLayer = Database.layer.pipe(Layer.provideMerge(ServicesLayer))

const createAppRuntime = () => ManagedRuntime.make(VingrotoLayer)

type AppRuntime = ReturnType<typeof createAppRuntime>

export { createAppRuntime, VingrotoLayer, type AppRuntime }
