import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import { homedir } from "node:os"
import path from "node:path"

interface AppPathsShape {
  readonly dataDir: string
  readonly configDir: string
  readonly runtimeDir: string
  readonly logsDir: string
  readonly database: string
  readonly config: string
  readonly socket: string
  readonly registration: string
  readonly token: string
  readonly lock: string
}

class AppPaths extends Context.Service<AppPaths, AppPathsShape>()(
  "vingroto/lib/app-paths/AppPaths",
) {
  static readonly layer = Layer.effect(
    AppPaths,
    Effect.gen(function* loadPaths() {
      const fs = yield* FileSystem.FileSystem
      const dataHome = yield* Config.String("XDG_DATA_HOME").pipe(
        Config.withDefault(path.join(homedir(), ".local", "share")),
      )
      const configHome = yield* Config.String("XDG_CONFIG_HOME").pipe(
        Config.withDefault(path.join(homedir(), ".config")),
      )
      const stateHome = yield* Config.String("XDG_STATE_HOME").pipe(
        Config.withDefault(path.join(homedir(), ".local", "state")),
      )
      const dataDir = path.join(dataHome, "vingroto")
      const configDir = path.join(configHome, "vingroto")
      const logsDir = path.join(stateHome, "vingroto")
      const runtimeDir = yield* Config.String("XDG_RUNTIME_DIR").pipe(
        Config.map((runtimeHome) => path.join(runtimeHome, "vingroto")),
        Config.withDefault(path.join(dataDir, "run")),
      )
      const paths = AppPaths.of({
        dataDir,
        configDir,
        runtimeDir,
        logsDir,
        database: path.join(dataDir, "vingroto.db"),
        config: path.join(configDir, "config.json"),
        socket: path.join(runtimeDir, "server.sock"),
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

export { AppPaths, type AppPathsShape }
