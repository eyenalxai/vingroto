import type { AccountConfig, AppConfig } from "@vingroto/core/config/schema"
import type { AccountSave, NewAccount } from "@vingroto/core/protocol/accounts"

import { AppPaths } from "@vingroto/core/app-paths"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Schema from "effect/Schema"

import { loadConfigFile } from "@/lib/config/load"
import { saveConfigFile } from "@/lib/config/save"
import { passwordReference, usernameReference } from "@/lib/credential/refs"
import { Credential } from "@/lib/credential/service"

class AccountNotFound extends Schema.TaggedError<AccountNotFound>()("AccountNotFound", {
  id: Schema.String,
  message: Schema.String,
}) {}

interface AccountWriteDeps {
  readonly configPath: string
  readonly credential: Credential["Service"]
  readonly fs: FileSystem.FileSystem
}

const resolveAccountId = (accounts: readonly AccountConfig[], email: string) => {
  const normalized = email.trim().toLowerCase()
  const existing = accounts.find((account) => account.email.trim().toLowerCase() === normalized)
  return existing?.id ?? normalized
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
  id: string,
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
  Effect.fn("Account.update")(function* updateConfiguredAccount(id: string, input: AccountSave) {
    const config = yield* loadConfigFile(deps.configPath, deps.fs)
    const existing = config.accounts.find((account) => account.id === id)
    if (existing === undefined) {
      return yield* new AccountNotFound({ id, message: `account ${id} is not configured` })
    }
    const account: AccountConfig = {
      id: existing.id,
      label: input.label,
      email: existing.email,
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

const accountWriteDeps = Effect.all({
  credential: Credential,
  paths: AppPaths,
  fs: FileSystem.FileSystem,
}).pipe(
  Effect.map(({ credential, paths, fs }): AccountWriteDeps => {
    return { configPath: paths.config, credential, fs }
  }),
)

const submitAccount = (input: NewAccount) =>
  accountWriteDeps.pipe(Effect.flatMap((deps) => makeSubmitAccount(deps)(input)))

const updateAccount = (id: string, input: AccountSave) =>
  accountWriteDeps.pipe(Effect.flatMap((deps) => makeUpdateAccount(deps)(id, input)))

export { AccountNotFound, makeSubmitAccount, makeUpdateAccount, submitAccount, updateAccount }
