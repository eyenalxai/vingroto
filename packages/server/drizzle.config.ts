import { defineConfig } from "drizzle-kit"
import { homedir } from "node:os"
import { join } from "node:path"

// Migrations are generated with `bun db:generate` and applied at runtime by the
// app's database layer, so this config only needs the offline schema paths.
// `dbCredentials` is kept so the CLI can also reach the live database when
// debugging a migration.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: join(homedir(), ".local", "share", "vingroto-dev", "vingroto.db"),
  },
})
