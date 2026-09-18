import { BunRuntime, BunServices } from "@effect/platform-bun"
import { AppPaths } from "@vingroto/core/app-paths"
import { isStandaloneExecutable } from "@vingroto/core/standalone"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { Command } from "effect/unstable/cli"
import path from "node:path"

import { apiCommand } from "@/lib/cli/api"
import { runTui } from "@/tui"

const packageJson = isStandaloneExecutable
  ? path.join(import.meta.dirname, "package.json")
  : path.join(import.meta.dirname, "../../../package.json")

const readVersion = Effect.gen(function* readVersion() {
  const fs = yield* FileSystem.FileSystem
  const raw = yield* fs.readFileString(packageJson)
  const pkg = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(Schema.Struct({ version: Schema.String })),
  )(raw)
  return pkg.version
})

const root = Command.make("vingroto", {}, () => runTui).pipe(
  Command.withDescription("Terminal mail client"),
  Command.withSubcommands([apiCommand]),
)

const main = Effect.gen(function* main() {
  const version = yield* readVersion
  yield* Command.run(root, { version })
})

const ServicesLayer = Layer.mergeAll(AppPaths.layer).pipe(Layer.provideMerge(BunServices.layer))

BunRuntime.runMain(main.pipe(Effect.provide(ServicesLayer)))
