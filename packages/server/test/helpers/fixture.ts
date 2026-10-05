import type { AppPathsShape } from "@vingroto/core/app-paths"
import type { AccountConfig } from "@vingroto/core/config/schema"
import type { AccountId, MailboxId, MessageId } from "@vingroto/core/ids"

import { BunServices } from "@effect/platform-bun"
import { AppPaths } from "@vingroto/core/app-paths"
import { Uid } from "@vingroto/core/ids"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import * as ManagedRuntime from "effect/ManagedRuntime"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { Database } from "@/lib/db/database"
import { MailboxTable, MessageTable } from "@/lib/db/schema"

type FixtureServices = Layer.Success<typeof BunServices.layer> | AppPaths | Database
type FixtureError = Layer.Error<typeof Database.layer>

interface Fixture {
  readonly paths: AppPathsShape
  readonly layers: Layer.Layer<FixtureServices, FixtureError>
  readonly cleanup: () => Promise<void>
  readonly run: <A, E>(program: Effect.Effect<A, E, FixtureServices>) => Promise<A>
}

interface MailboxSeed {
  readonly account: AccountId
  readonly path: string
  readonly name?: string
  readonly specialUse?: string
  readonly muted?: boolean
}

interface MailboxRow {
  readonly id: MailboxId
  readonly accountId: AccountId
  readonly mailboxPath: string
}

interface MessageSeed {
  readonly account: AccountId
  readonly path: string
  readonly uid: number
  readonly messageId?: string | null
  readonly seen?: boolean
  readonly subject?: string
  readonly date?: number
}

interface MessageIndex {
  readonly id: (account: AccountId, mailboxPath: string, uid: number) => MessageId
}

const missing = (what: string): never => {
  throw new Error(`test fixture is missing ${what}`)
}

const makeFixture = async (): Promise<Fixture> => {
  const root = await mkdtemp(path.join(tmpdir(), "vingroto-test-"))
  const dataDir = path.join(root, "data")
  const configDir = path.join(root, "config")
  const logsDir = path.join(root, "logs")
  const runtimeDir = path.join(root, "run")
  await Promise.all([
    mkdir(dataDir, { recursive: true }),
    mkdir(configDir, { recursive: true }),
    mkdir(logsDir, { recursive: true }),
    mkdir(runtimeDir, { recursive: true }),
  ])
  const paths = AppPaths.of({
    profile: "development",
    appName: "vingroto-dev",
    dataDir,
    configDir,
    logsDir,
    runtimeDir,
    database: path.join(dataDir, "vingroto.db"),
    config: path.join(configDir, "config.json"),
    registration: path.join(runtimeDir, "server.json"),
    token: path.join(runtimeDir, "token"),
    lock: path.join(runtimeDir, "server.lock"),
  })
  const platform = Layer.merge(
    Layer.merge(Layer.succeed(AppPaths, paths), BunServices.layer),
    Logger.layer([]),
  )
  const layers: Layer.Layer<FixtureServices, FixtureError> = Layer.merge(
    platform,
    Database.layer.pipe(Layer.provide(platform)),
  )
  const runtime = ManagedRuntime.make(layers)
  return {
    paths,
    layers,
    cleanup: async () => {
      await runtime.dispose()
      await rm(root, { force: true, recursive: true })
    },
    run: (program) => runtime.runPromise(program),
  }
}

const withFixture = async <A>(use: (fixture: Fixture) => Promise<A>): Promise<A> => {
  const fixture = await makeFixture()
  try {
    return await use(fixture)
  } finally {
    await fixture.cleanup()
  }
}

const writeConfig = async (fixture: Fixture, accounts: readonly AccountConfig[]): Promise<void> => {
  await writeFile(fixture.paths.config, JSON.stringify({ accounts }))
}

const accountConfig = (id: AccountId, label: string = id): AccountConfig => ({
  id,
  label,
  email: id,
  auth: "password",
  saveSent: true,
  imap: { host: "127.0.0.1", port: 993, security: "tls" },
  smtp: { host: "127.0.0.1", port: 465, security: "tls" },
})

const mailboxId = (
  mailboxes: readonly MailboxRow[],
  account: AccountId,
  mailboxPath: string,
): MailboxId => {
  const found = mailboxes.find(
    (row) => row.accountId === account && row.mailboxPath === mailboxPath,
  )
  return found?.id ?? missing(`mailbox ${account} ${mailboxPath}`)
}

const seedMailboxes = Effect.fn("seedMailboxes")(function* insertMailboxes(
  seeds: readonly MailboxSeed[],
) {
  const database = yield* Database
  const now = yield* Clock.currentTimeMillis
  const rows = yield* database.client
    .insert(MailboxTable)
    .values(
      seeds.map((seed) => ({
        account_id: seed.account,
        path: seed.path,
        name: seed.name ?? seed.path,
        delimiter: "/",
        special_use: seed.specialUse ?? null,
        selectable: true,
        muted: seed.muted ?? false,
        created_at: now,
        updated_at: now,
      })),
    )
    .returning({
      id: MailboxTable.id,
      account_id: MailboxTable.account_id,
      path: MailboxTable.path,
    })
  return rows.map((row) => ({ id: row.id, accountId: row.account_id, mailboxPath: row.path }))
})

const seedMessages = Effect.fn("seedMessages")(function* insertMessages(
  mailboxes: readonly MailboxRow[],
  seeds: readonly MessageSeed[],
) {
  const database = yield* Database
  const now = yield* Clock.currentTimeMillis
  const ids = new Map(mailboxes.map((row) => [`${row.accountId}\u0000${row.mailboxPath}`, row.id]))
  const mailboxOf = (account: AccountId, mailboxPath: string): MailboxId => {
    const id = ids.get(`${account}\u0000${mailboxPath}`)
    return id ?? missing(`mailbox ${account} ${mailboxPath}`)
  }
  const rows = yield* database.client
    .insert(MessageTable)
    .values(
      seeds.map((seed) => ({
        account_id: seed.account,
        mailbox_id: mailboxOf(seed.account, seed.path),
        uid: Uid.make(seed.uid),
        message_id: seed.messageId ?? null,
        subject: seed.subject ?? `${seed.messageId ?? "no id"} ${seed.uid}`,
        from_address: "sender@example.com",
        date: seed.date ?? 1_700_000_000_000 + seed.uid * 1000,
        seen: seed.seen ?? false,
        created_at: now,
        updated_at: now,
      })),
    )
    .returning({ id: MessageTable.id, mailbox_id: MessageTable.mailbox_id, uid: MessageTable.uid })
  const mailboxById = new Map(mailboxes.map((row) => [row.id, row]))
  const messageIds = new Map(
    rows.map((row) => {
      const mailbox = mailboxById.get(row.mailbox_id)
      const key = `${mailbox?.accountId ?? ""}\u0000${mailbox?.mailboxPath ?? ""}\u0000${row.uid}`
      return [key, row.id] as const
    }),
  )
  return {
    id: (account: AccountId, mailboxPath: string, uid: number) => {
      const id = messageIds.get(`${account}\u0000${mailboxPath}\u0000${uid}`)
      return id ?? missing(`message ${account} ${mailboxPath} ${uid}`)
    },
  }
})

export {
  accountConfig,
  mailboxId,
  makeFixture,
  seedMailboxes,
  seedMessages,
  withFixture,
  writeConfig,
  type Fixture,
  type MailboxRow,
  type MailboxSeed,
  type MessageIndex,
  type MessageSeed,
}
