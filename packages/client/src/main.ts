import { BunRuntime } from "@effect/platform-bun"
import { isStandaloneExecutable } from "@vingroto/core/standalone"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Schema from "effect/Schema"
import { CliConfig, Command, GlobalFlag } from "effect/unstable/cli"
import path from "node:path"

import { apiCommand } from "@/lib/cli/api"
import { completionsCommand } from "@/lib/cli/completions/command"
import { rootCommand } from "@/lib/cli/root"
import { ServicesLayer } from "@/lib/services"

const packageJson = isStandaloneExecutable
  ? path.join(import.meta.dirname, "package.json")
  : path.join(import.meta.dirname, "../../../package.json")

const readVersion = Effect.gen(function* readVersion() {
  const fs = yield* FileSystem.FileSystem
  const raw = yield* fs.readFileString(packageJson)
  const pkg = yield* Schema.decodeEffect(
    Schema.fromJsonString(Schema.Struct({ version: Schema.String })),
  )(raw)
  return pkg.version
})

const root = rootCommand.pipe(Command.withSubcommands([apiCommand, completionsCommand]))

// Why: the built-in --completions flag only knows bash, zsh and fish; the completions subcommand replaces it so the CLI exposes a single completions surface.
const builtIns: readonly GlobalFlag.BuiltIn[] = [
  GlobalFlag.Help,
  GlobalFlag.Version,
  GlobalFlag.Wizard,
  GlobalFlag.LogLevel,
]

const main = Effect.gen(function* main() {
  const version = yield* readVersion
  yield* Command.run(root, { version }).pipe(Effect.provide(CliConfig.layer({ builtIns })))
})

BunRuntime.runMain(main.pipe(Effect.provide(ServicesLayer)))
