import { BunServices } from "@effect/platform-bun"
import { AppPaths } from "@vingroto/core/app-paths"
import * as Layer from "effect/Layer"

// Why: AppPaths reads the home directory while it builds, so Bun services must be in scope for it.
// Merging them back in gives the TUI runtime and the CLI one layer for both.
const ServicesLayer = Layer.merge(
  AppPaths.layer.pipe(Layer.provide(BunServices.layer)),
  BunServices.layer,
)

export { ServicesLayer }
