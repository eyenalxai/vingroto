import type { AccountConfig } from "@vingroto/core/config/schema"
import type { AccountSave } from "@vingroto/core/protocol/accounts"

import { AppConfigFile } from "@vingroto/core/config/schema"
import { AccountId } from "@vingroto/core/ids"
import { NewAccount } from "@vingroto/core/protocol/accounts"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Schema from "effect/Schema"

import type { Credential } from "@/lib/credential/service"

import { makeSubmitAccount, makeUpdateAccount } from "@/lib/config/accounts"
import { loadConfigFile } from "@/lib/config/load"
import { saveConfigFile } from "@/lib/config/save"
import { passwordReference, usernameReference } from "@/lib/credential/refs"
import { CredentialNotFound } from "@/lib/credential/service"

import type { Fixture } from "./helpers/fixture"

import { withFixture } from "./helpers/fixture"

const alpha = AccountId.make("alpha@example.com")

const clientId = "alpha-client.apps.googleusercontent.com"

const baseAccount: Pick<AccountSave, "label" | "saveSent" | "imap" | "smtp" | "username"> = {
  label: "Alpha",
  saveSent: true,
  imap: { host: "imap.gmail.com", port: 993, security: "tls" },
  smtp: { host: "smtp.gmail.com", port: 465, security: "tls" },
  username: "alpha@example.com",
}

interface FakeCredential {
  readonly secrets: Map<string, string>
  readonly service: Credential["Service"]
}

const makeFakeCredential = (): FakeCredential => {
  const secrets = new Map<string, string>()
  const get = Effect.fn("Credential.get")(function* get(reference: string) {
    const secret = secrets.get(reference)
    if (secret === undefined) {
      return yield* new CredentialNotFound({
        reference,
        message: "no credentials stored for this account",
      })
    }
    return secret
  })
  const set = Effect.fn("Credential.set")(function* set(reference: string, secret: string) {
    yield* Effect.sync(() => {
      secrets.set(reference, secret)
    })
  })
  return { secrets, service: { get, set } }
}

const runWithFileSystem = <A, E>(
  fixture: Fixture,
  use: (fs: FileSystem.FileSystem) => Effect.Effect<A, E>,
): Promise<A> => fixture.run(Effect.flatMap(FileSystem.FileSystem, use))

const readConfig = (fs: FileSystem.FileSystem, configPath: string) =>
  Effect.gen(function* readSavedConfig() {
    const raw = yield* fs.readFileString(configPath)
    return yield* Schema.decodeEffect(Schema.fromJsonString(AppConfigFile))(raw)
  })

const writeJsonFile = (fs: FileSystem.FileSystem, path: string, value: unknown) =>
  Effect.gen(function* writeJson() {
    const json = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(value)
    yield* fs.writeFileString(path, json)
  })

describe("account auth config", () => {
  test("a config without auth decodes as a password account", async () => {
    await withFixture(async (fixture) => {
      const legacy = { id: alpha, email: alpha, ...baseAccount }
      const account = await runWithFileSystem(fixture, (fs) =>
        Effect.gen(function* loadLegacyConfig() {
          yield* writeJsonFile(fs, fixture.paths.config, { accounts: [legacy] })
          const config = yield* loadConfigFile(fixture.paths.config, fs)
          return config.accounts[0]
        }),
      )
      expect(account?.auth).toBe("password")
      expect(account?.oauth).toBeUndefined()
    })
  })

  test("an oauth2 account round-trips through the config file", async () => {
    await withFixture(async (fixture) => {
      const account: AccountConfig = {
        id: alpha,
        label: "Alpha",
        email: alpha,
        auth: "oauth2",
        oauth: { provider: "gmail", clientId },
        saveSent: true,
        imap: { host: "imap.gmail.com", port: 993, security: "tls" },
        smtp: { host: "smtp.gmail.com", port: 465, security: "tls" },
      }
      const reloaded = await runWithFileSystem(fixture, (fs) =>
        Effect.gen(function* roundTripConfig() {
          const empty = yield* loadConfigFile(fixture.paths.config, fs)
          yield* saveConfigFile(fixture.paths.config, fs, { ...empty, accounts: [account] })
          return yield* loadConfigFile(fixture.paths.config, fs)
        }),
      )
      expect(reloaded.accounts).toEqual([account])
    })
  })

  test("oauth2 without oauth fails to load", async () => {
    await withFixture(async (fixture) => {
      const broken = { id: alpha, email: alpha, auth: "oauth2", ...baseAccount }
      const error = await runWithFileSystem(fixture, (fs) =>
        Effect.gen(function* loadBrokenConfig() {
          yield* writeJsonFile(fs, fixture.paths.config, { accounts: [broken] })
          return yield* Effect.flip(loadConfigFile(fixture.paths.config, fs))
        }),
      )
      expect(error._tag).toBe("ConfigInvalid")
    })
  })
})

describe("account auth protocol", () => {
  test("an oauth2 NewAccount decodes without a password", async () => {
    const decoded = await Effect.runPromise(
      Schema.decodeEffect(NewAccount)({
        ...baseAccount,
        email: alpha,
        auth: "oauth2",
        oauth: { provider: "gmail", clientId },
      }),
    )
    expect(decoded.auth).toBe("oauth2")
    expect(decoded.password).toBeUndefined()
  })

  test("a password NewAccount decodes without a password but submit rejects it", async () => {
    await withFixture(async (fixture) => {
      const fake = makeFakeCredential()
      const outcome = await runWithFileSystem(fixture, (fs) =>
        Effect.gen(function* submitWithoutPassword() {
          const decoded = yield* Schema.decodeEffect(NewAccount)({
            ...baseAccount,
            email: alpha,
            auth: "password",
          })
          const submit = makeSubmitAccount({
            configPath: fixture.paths.config,
            credential: fake.service,
            fs,
          })
          const error = yield* Effect.flip(submit(decoded))
          const exists = yield* fs.exists(fixture.paths.config)
          return { error, exists }
        }),
      )
      expect(outcome.error._tag).toBe("AccountAuthInvalid")
      expect(outcome.exists).toBe(false)
      expect(fake.secrets.size).toBe(0)
    })
  })
})

describe("account persistence", () => {
  test("an oauth2 account stores its username and no password", async () => {
    await withFixture(async (fixture) => {
      const fake = makeFakeCredential()
      const outcome = await runWithFileSystem(fixture, (fs) =>
        Effect.gen(function* saveOAuthAccount() {
          const submit = makeSubmitAccount({
            configPath: fixture.paths.config,
            credential: fake.service,
            fs,
          })
          const account = yield* submit({
            ...baseAccount,
            email: alpha,
            auth: "oauth2",
            oauth: { provider: "gmail", clientId },
          })
          const config = yield* readConfig(fs, fixture.paths.config)
          return { account, config }
        }),
      )
      expect(outcome.account.auth).toBe("oauth2")
      expect(outcome.account.oauth).toEqual({ provider: "gmail", clientId })
      expect(fake.secrets.get(usernameReference(alpha))).toBe("alpha@example.com")
      expect(fake.secrets.has(passwordReference(alpha))).toBe(false)
      expect(outcome.config.accounts[0]?.auth).toBe("oauth2")
      expect(outcome.config.accounts[0]?.oauth).toEqual({ provider: "gmail", clientId })
    })
  })

  test("a password account stores username and password as before", async () => {
    await withFixture(async (fixture) => {
      const fake = makeFakeCredential()
      const config = await runWithFileSystem(fixture, (fs) =>
        Effect.gen(function* savePasswordAccount() {
          const submit = makeSubmitAccount({
            configPath: fixture.paths.config,
            credential: fake.service,
            fs,
          })
          yield* submit({ ...baseAccount, email: alpha, password: "app-password" })
          return yield* readConfig(fs, fixture.paths.config)
        }),
      )
      expect(fake.secrets.get(usernameReference(alpha))).toBe("alpha@example.com")
      expect(fake.secrets.get(passwordReference(alpha))).toBe("app-password")
      expect(config.accounts[0]?.auth).toBe("password")
      expect(config.accounts[0]?.oauth).toBeUndefined()
    })
  })

  test("oauth2 without oauth settings is rejected before anything is stored", async () => {
    await withFixture(async (fixture) => {
      const fake = makeFakeCredential()
      const outcome = await runWithFileSystem(fixture, (fs) =>
        Effect.gen(function* rejectBrokenOAuth() {
          const submit = makeSubmitAccount({
            configPath: fixture.paths.config,
            credential: fake.service,
            fs,
          })
          const error = yield* Effect.flip(submit({ ...baseAccount, email: alpha, auth: "oauth2" }))
          const exists = yield* fs.exists(fixture.paths.config)
          return { error, exists }
        }),
      )
      expect(outcome.error._tag).toBe("AccountAuthInvalid")
      expect(outcome.exists).toBe(false)
      expect(fake.secrets.size).toBe(0)
    })
  })

  test("updating keeps a stored password and rejects oauth2 without settings", async () => {
    await withFixture(async (fixture) => {
      const fake = makeFakeCredential()
      const outcome = await runWithFileSystem(fixture, (fs) =>
        Effect.gen(function* updateAccount() {
          const deps = { configPath: fixture.paths.config, credential: fake.service, fs }
          const submit = makeSubmitAccount(deps)
          const update = makeUpdateAccount(deps)
          yield* submit({ ...baseAccount, email: alpha, password: "app-password" })
          const renamed = yield* update(alpha, { ...baseAccount, label: "Renamed" })
          const error = yield* Effect.flip(update(alpha, { ...baseAccount, auth: "oauth2" }))
          const config = yield* readConfig(fs, fixture.paths.config)
          return { config, error, renamed }
        }),
      )
      expect(outcome.renamed.label).toBe("Renamed")
      expect(fake.secrets.get(passwordReference(alpha))).toBe("app-password")
      expect(outcome.config.accounts[0]?.label).toBe("Renamed")
      expect(outcome.config.accounts[0]?.auth).toBe("password")
      expect(outcome.error._tag).toBe("AccountAuthInvalid")
    })
  })
})
