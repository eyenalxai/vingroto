import type { ConfigState, ServerStatus } from "@vingroto/core/protocol/accounts"

import { AppPaths } from "@vingroto/core/app-paths"
import { describeError } from "@vingroto/core/errors"
import { isStandaloneExecutable } from "@vingroto/core/standalone"
import { count } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Schema from "effect/Schema"
import path from "node:path"

import { loadConfig } from "@/lib/config/load"
import { Database } from "@/lib/db/database"
import { MailboxTable } from "@/lib/db/schema"
import { ServerLifecycle } from "@/lib/lifecycle"

const packageJson = isStandaloneExecutable
  ? path.join(import.meta.dirname, "package.json")
  : path.join(import.meta.dirname, "../../../../package.json")

const readVersion = Effect.fnUntraced(function* readPackageVersion() {
  const fs = yield* FileSystem.FileSystem
  const raw = yield* fs.readFileString(packageJson)
  const pkg = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(Schema.Struct({ version: Schema.String })),
  )(raw)
  return pkg.version
})

const readServerStatus = Effect.fn("ServerStatus.read")(function* readServerStatus() {
  const appPaths = yield* AppPaths
  const fs = yield* FileSystem.FileSystem
  const database = yield* Database
  const lifecycle = yield* ServerLifecycle
  const version = yield* readVersion()
  const exists = yield* fs.exists(appPaths.config).pipe(Effect.orElseSucceed(() => false))
  let config: ConfigState = { _tag: "empty" }
  if (exists) {
    config = yield* loadConfig().pipe(
      Effect.map((loaded) => {
        return {
          _tag: "ok" as const,
          config: { accounts: [...loaded.accounts], sync: loaded.sync },
        }
      }),
      Effect.catchTags({
        ConfigInvalid: (error) =>
          Effect.succeed({
            _tag: "error" as const,
            message: `invalid config at ${error.path}: ${describeError(error.cause)}`,
          }),
        ConfigUnreadable: (error) =>
          Effect.succeed({ _tag: "error" as const, message: error.message }),
      }),
    )
  }
  const databaseState = yield* database.client
    .select({ value: count() })
    .from(MailboxTable)
    .pipe(
      Effect.map((): ServerStatus["database"] => {
        return { _tag: "ok" }
      }),
      Effect.catch((error) =>
        Effect.succeed({ _tag: "error" as const, message: describeError(error) }),
      ),
    )
  return {
    version,
    pid: process.pid,
    startedAt: lifecycle.startedAt,
    socket: lifecycle.socket,
    config,
    database: databaseState,
  }
})

export { readServerStatus, readVersion }
