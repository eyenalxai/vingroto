import type { AppConfig, ServerConfig } from "@vingroto/core/config/schema"

import { AccountConfig } from "@vingroto/core/config/schema"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { loadConfig } from "@/lib/config/load"
import { saveConfig } from "@/lib/config/save"
import { passwordReference, usernameReference } from "@/lib/credential/refs"
import { Credential } from "@/lib/credential/service"

class AccountNotFound extends Schema.TaggedError<AccountNotFound>()("AccountNotFound", {
  id: Schema.String,
  message: Schema.String,
}) {}

interface AccountSave {
  readonly label: string
  readonly name: string | undefined
  readonly imap: ServerConfig
  readonly smtp: ServerConfig
  readonly username: string
  readonly password: string | undefined
}

interface NewAccount extends AccountSave {
  readonly email: string
  readonly password: string
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

const storeCredentials = (id: string, input: AccountSave) =>
  Effect.gen(function* storeAccountCredentials() {
    const credential = yield* Credential
    yield* credential.set(usernameReference(id), input.username)
    if (input.password !== undefined) {
      yield* credential.set(passwordReference(id), input.password)
    }
  })

const submitAccount = (input: NewAccount) =>
  Effect.gen(function* persistAccount() {
    const config = yield* loadConfig()
    const id = resolveAccountId(config.accounts, input.email)
    const account = new AccountConfig({
      id,
      label: input.label,
      name: input.name,
      email: input.email,
      imap: input.imap,
      smtp: input.smtp,
    })
    yield* storeCredentials(id, input)
    yield* saveConfig(upsertAccount(config, account))
    yield* Effect.logInfo("account saved").pipe(
      Effect.annotateLogs({ account: id, email: input.email }),
    )
    return account
  })

const updateAccount = (id: string, input: AccountSave) =>
  Effect.gen(function* updateConfiguredAccount() {
    const config = yield* loadConfig()
    const existing = config.accounts.find((account) => account.id === id)
    if (existing === undefined) {
      return yield* new AccountNotFound({ id, message: `account ${id} is not configured` })
    }
    const account = new AccountConfig({
      id: existing.id,
      label: input.label,
      name: input.name,
      email: existing.email,
      imap: input.imap,
      smtp: input.smtp,
    })
    yield* storeCredentials(id, input)
    yield* saveConfig(upsertAccount(config, account))
    yield* Effect.logInfo("account updated").pipe(
      Effect.annotateLogs({ account: id, email: existing.email }),
    )
    return account
  })

export { AccountNotFound, submitAccount, updateAccount, type AccountSave, type NewAccount }
