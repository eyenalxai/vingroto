import type { EffectSQLiteBunDatabase } from "drizzle-orm/effect-sqlite-bun"

import { layer as sqliteClientLayer } from "@effect/sql-sqlite-bun/SqliteClient"
import { AppPaths } from "@vingroto/core/app-paths"
import { isStandaloneExecutable } from "@vingroto/core/standalone"
import { sql } from "drizzle-orm"
import { makeWithDefaults } from "drizzle-orm/effect-sqlite-bun"
import { migrate } from "drizzle-orm/effect-sqlite-bun/migrator"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import path from "node:path"

const migrationsFolder = isStandaloneExecutable
  ? path.join(import.meta.dirname, "drizzle")
  : path.join(import.meta.dirname, "../../../drizzle")

interface DatabaseShape {
  readonly client: EffectSQLiteBunDatabase
}

class Database extends Context.Service<Database, DatabaseShape>()("vingroto/lib/db/Database") {
  static readonly layer = Layer.unwrap(
    Effect.gen(function* databaseLayer() {
      const paths = yield* AppPaths
      return Layer.effect(
        Database,
        Effect.gen(function* openDatabase() {
          const client = yield* makeWithDefaults()
          yield* migrate(client, { migrationsFolder })
          // Foreign keys are per-connection in SQLite and drizzle has no pragma API: the one raw statement.
          yield* client.run(sql`PRAGMA foreign_keys = ON`)
          yield* Effect.logInfo("database ready").pipe(
            Effect.annotateLogs({ path: paths.database }),
          )
          return Database.of({ client })
        }),
      ).pipe(Layer.provide(sqliteClientLayer({ filename: paths.database })))
    }),
  )
}

export { Database, type DatabaseShape }
