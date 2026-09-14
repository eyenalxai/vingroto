import { count } from "drizzle-orm"
import * as Effect from "effect/Effect"

import type { AppConfig } from "@/lib/config/schema"

import { AppPaths } from "@/lib/app-paths"
import { loadConfig } from "@/lib/config/load"
import { Database } from "@/lib/db/database"
import { MailboxTable } from "@/lib/db/schema"

interface BootReport {
  readonly paths: {
    readonly data: string
    readonly config: string
  }
  readonly config:
    | { readonly _tag: "ok"; readonly config: AppConfig }
    | { readonly _tag: "error"; readonly message: string }
  readonly database:
    | { readonly _tag: "ok"; readonly mailboxes: number }
    | { readonly _tag: "error"; readonly message: string }
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error))

const boot = Effect.gen(function* boot() {
  const paths = yield* AppPaths

  const database = yield* Effect.gen(function* inspectDatabase() {
    const service = yield* Database
    const rows = yield* service.client.select({ value: count() }).from(MailboxTable)
    return rows[0]?.value ?? 0
  }).pipe(
    Effect.map((mailboxes) => {
      return { _tag: "ok" as const, mailboxes }
    }),
    Effect.catch((error) => Effect.succeed({ _tag: "error" as const, message: describe(error) })),
  )

  const config = yield* loadConfig().pipe(
    Effect.map((loaded) => {
      return { _tag: "ok" as const, config: loaded }
    }),
    Effect.catchTags({
      ConfigFileMissing: (error) =>
        Effect.succeed({
          _tag: "error" as const,
          message: `no config file at ${error.path} — create one with your accounts`,
        }),
      ConfigInvalid: (error) =>
        Effect.succeed({
          _tag: "error" as const,
          message: `invalid config at ${error.path}: ${describe(error.cause)}`,
        }),
      ConfigUnreadable: (error) =>
        Effect.succeed({ _tag: "error" as const, message: error.message }),
    }),
  )

  return { paths: { data: paths.dataDir, config: paths.config }, config, database }
})

export { boot, type BootReport }
