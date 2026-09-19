import type { AccountConfig, AppConfig } from "@vingroto/core/config/schema"
import type { AccountSave, NewAccount } from "@vingroto/core/protocol/accounts"
import type * as FileSystem from "effect/FileSystem"

import { AccountId } from "@vingroto/core/ids"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import type { Credential } from "@/lib/credential/service"

import { loadConfigFile } from "@/lib/config/load"
import { saveConfigFile } from "@/lib/config/save"
import { passwordReference, usernameReference } from "@/lib/credential/refs"

class AccountNotFound extends Schema.TaggedError<AccountNotFound>()("AccountNotFound", {
  id: AccountId,
  message: Schema.String,
}) {}

class AccountOrderInvalid extends Schema.TaggedError<AccountOrderInvalid>()("AccountOrderInvalid", {
  message: Schema.String,
}) {}

interface AccountWriteDeps {
  readonly configPath: string
  readonly credential: Credential["Service"]
  readonly fs: FileSystem.FileSystem
}

const resolveAccountId = (accounts: readonly AccountConfig[], email: string): AccountId => {
  const normalized = email.trim().toLowerCase()
  const existing = accounts.find((account) => account.email.trim().toLowerCase() === normalized)
  return existing?.id ?? AccountId.make(normalized)
}

const upsertAccount = (config: AppConfig, account: AccountConfig): AppConfig => {
  const exists = config.accounts.some((candidate) => candidate.id === account.id)
  const accounts = exists
    ? config.accounts.map((candidate) => (candidate.id === account.id ? account : candidate))
    : [...config.accounts, account]
  return { ...config, accounts }
}

const storeCredentials = Effect.fnUntraced(function* storeAccountCredentials(
  credential: Credential["Service"],
  id: AccountId,
  input: AccountSave,
) {
  yield* credential.set(usernameReference(id), input.username)
  if (input.password !== undefined) {
    yield* credential.set(passwordReference(id), input.password)
  }
})

const makeSubmitAccount = (deps: AccountWriteDeps) =>
  Effect.fn("Account.submit")(function* persistAccount(input: NewAccount) {
    const config = yield* loadConfigFile(deps.configPath, deps.fs)
    const id = resolveAccountId(config.accounts, input.email)
    const account: AccountConfig = {
      id,
      label: input.label,
      email: input.email,
      saveSent: input.saveSent,
      imap: input.imap,
      smtp: input.smtp,
      ...(input.name === undefined ? {} : { name: input.name }),
    }
    yield* storeCredentials(deps.credential, id, input)
    yield* saveConfigFile(deps.configPath, deps.fs, upsertAccount(config, account))
    yield* Effect.logInfo("account saved").pipe(
      Effect.annotateLogs({ account: id, email: input.email }),
    )
    return account
  })

const makeUpdateAccount = (deps: AccountWriteDeps) =>
  Effect.fn("Account.update")(function* updateConfiguredAccount(id: AccountId, input: AccountSave) {
    const config = yield* loadConfigFile(deps.configPath, deps.fs)
    const existing = config.accounts.find((account) => account.id === id)
    if (existing === undefined) {
      return yield* new AccountNotFound({ id, message: `account ${id} is not configured` })
    }
    const account: AccountConfig = {
      id: existing.id,
      label: input.label,
      email: existing.email,
      saveSent: input.saveSent,
      imap: input.imap,
      smtp: input.smtp,
      ...(input.name === undefined ? {} : { name: input.name }),
    }
    yield* storeCredentials(deps.credential, id, input)
    yield* saveConfigFile(deps.configPath, deps.fs, upsertAccount(config, account))
    yield* Effect.logInfo("account updated").pipe(
      Effect.annotateLogs({ account: id, email: existing.email }),
    )
    return account
  })

const makeReorderAccounts = (configPath: string, fs: FileSystem.FileSystem) =>
  Effect.fn("Config.reorderAccounts")(function* reorderConfiguredAccounts(
    accountIds: readonly AccountId[],
  ) {
    const config = yield* loadConfigFile(configPath, fs)
    const requested = new Set(accountIds)
    if (requested.size !== accountIds.length) {
      return yield* new AccountOrderInvalid({
        message: "accountIds lists an account more than once",
      })
    }
    if (accountIds.length !== config.accounts.length) {
      return yield* new AccountOrderInvalid({
        message: `accountIds must list all ${String(config.accounts.length)} configured accounts`,
      })
    }
    const byId = new Map(config.accounts.map((account) => [account.id, account]))
    const unknown = accountIds.find((id) => !byId.has(id))
    if (unknown !== undefined) {
      return yield* new AccountOrderInvalid({ message: `account ${unknown} is not configured` })
    }
    const accounts = accountIds.flatMap((id) => {
      const account = byId.get(id)
      return account === undefined ? [] : [account]
    })
    yield* saveConfigFile(configPath, fs, { ...config, accounts })
    return yield* Effect.logInfo("account order saved").pipe(
      Effect.annotateLogs({ accounts: accounts.length }),
    )
  })

export {
  AccountNotFound,
  AccountOrderInvalid,
  makeReorderAccounts,
  makeSubmitAccount,
  makeUpdateAccount,
}
