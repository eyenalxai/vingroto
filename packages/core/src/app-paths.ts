import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import { homedir } from "node:os"
import path from "node:path"

import { isStandaloneExecutable } from "./standalone"

const profiles = ["installed", "development"] as const

type Profile = (typeof profiles)[number]

interface AppPathsShape {
  readonly profile: Profile
  readonly appName: string
  readonly dataDir: string
  readonly configDir: string
  readonly runtimeDir: string
  readonly logsDir: string
  readonly database: string
  readonly config: string
  readonly registration: string
  readonly token: string
  readonly lock: string
}

class AppPaths extends Context.Service<AppPaths, AppPathsShape>()(
  "@vingroto/core/app-paths/AppPaths",
) {
  static readonly layer = Layer.effect(
    AppPaths,
    Effect.gen(function* loadPaths() {
      const fs = yield* FileSystem.FileSystem
      const profile = yield* Config.Literals(profiles, "VINGROTO_PROFILE").pipe(
        Config.withDefault(isStandaloneExecutable ? "installed" : "development"),
      )
      const appName = profile === "installed" ? "vingroto" : "vingroto-dev"
      const dataHome = yield* Config.NonEmptyString("XDG_DATA_HOME").pipe(
        Config.withDefault(path.join(homedir(), ".local", "share")),
      )
      const configHome = yield* Config.NonEmptyString("XDG_CONFIG_HOME").pipe(
        Config.withDefault(path.join(homedir(), ".config")),
      )
      const stateHome = yield* Config.NonEmptyString("XDG_STATE_HOME").pipe(
        Config.withDefault(path.join(homedir(), ".local", "state")),
      )
      const dataDir = path.join(dataHome, appName)
      const configDir = path.join(configHome, appName)
      const logsDir = path.join(stateHome, appName)
      const runtimeDir = yield* Config.NonEmptyString("XDG_RUNTIME_DIR").pipe(
        Config.map((runtimeHome) => path.join(runtimeHome, appName)),
        Config.withDefault(path.join(dataDir, "run")),
      )
      const paths = AppPaths.of({
        profile,
        appName,
        dataDir,
        configDir,
        runtimeDir,
        logsDir,
        database: path.join(dataDir, "vingroto.db"),
        config: path.join(configDir, "config.json"),
        registration: path.join(runtimeDir, "server.json"),
        token: path.join(runtimeDir, "token"),
        lock: path.join(runtimeDir, "server.lock"),
      })
      yield* fs.makeDirectory(dataDir, { recursive: true })
      yield* fs.makeDirectory(configDir, { recursive: true })
      yield* fs.makeDirectory(logsDir, { recursive: true })
      yield* fs.makeDirectory(runtimeDir, { recursive: true })
      return paths
    }),
  )
}

export { AppPaths, type AppPathsShape, type Profile }
