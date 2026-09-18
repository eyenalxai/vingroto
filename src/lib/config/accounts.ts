import * as Effect from "effect/Effect"

import type { AppConfig, ServerConfig } from "@/lib/config/schema"

import { loadConfig } from "@/lib/config/load"
import { saveConfig } from "@/lib/config/save"
import { AccountConfig } from "@/lib/config/schema"
import { passwordReference, usernameReference } from "@/lib/credential/refs"
import { Credential } from "@/lib/credential/service"

interface NewAccount {
  readonly email: string
  readonly label: string
  readonly name: string | undefined
  readonly imap: ServerConfig
  readonly smtp: ServerConfig
  readonly username: string
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

const submitAccount = (input: NewAccount) =>
  Effect.gen(function* persistAccount() {
    const credential = yield* Credential
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
    yield* credential.set(usernameReference(id), input.username)
    yield* credential.set(passwordReference(id), input.password)
    yield* saveConfig(upsertAccount(config, account))
    yield* Effect.logInfo("account saved").pipe(
      Effect.annotateLogs({ account: id, email: input.email }),
    )
    return account
  })

export { submitAccount, type NewAccount }
