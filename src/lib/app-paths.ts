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
  readonly database: string
  readonly config: string
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
      const dataDir = path.join(dataHome, "vingroto")
      const configDir = path.join(configHome, "vingroto")
      const paths = AppPaths.of({
        dataDir,
        configDir,
        database: path.join(dataDir, "vingroto.db"),
        config: path.join(configDir, "config.json"),
      })
      yield* fs.makeDirectory(dataDir, { recursive: true })
      yield* fs.makeDirectory(configDir, { recursive: true })
      return paths
    }),
  )
}

export { AppPaths, type AppPathsShape }
