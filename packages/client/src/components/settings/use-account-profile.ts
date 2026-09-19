import type { KeyEvent } from "@opentui/core"
import type { AccountConfig } from "@vingroto/core/config/schema"
import type { AccountId } from "@vingroto/core/ids"
import type { Setter } from "solid-js"

import { Effect, Fiber } from "effect"
import { createEffect, createSignal } from "solid-js"
import { createStore } from "solid-js/store"

import type { AccountDraft, FieldId } from "@/components/setup/form-model"
import type { AppRuntime } from "@/lib/runtime"

import {
  applySecretKey,
  cycleSecurity,
  emptyDraft,
  validateEditDraft,
} from "@/components/setup/form-model"
import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"

interface UseAccountProfileOptions {
  readonly runtime: AppRuntime
  readonly accounts: () => readonly AccountConfig[]
  readonly onSaved: (account: AccountConfig) => void
  readonly onStatus: (message: string, error?: boolean) => void
  readonly onDisconnected: (message: string) => void
}

const draftFromAccount = (account: AccountConfig, username: string | undefined): AccountDraft => {
  return {
    ...emptyDraft(),
    email: account.email,
    label: account.label,
    name: account.name ?? "",
    username: username ?? account.email,
    imapHost: account.imap.host,
    imapPort: String(account.imap.port),
    imapSecurity: account.imap.security,
    smtpHost: account.smtp.host,
    smtpPort: String(account.smtp.port),
    smtpSecurity: account.smtp.security,
    saveSent: account.saveSent,
  }
}

const setMembership = (
  set: Setter<ReadonlySet<AccountId>>,
  accountId: AccountId,
  present: boolean,
): void => {
  set((current) => {
    const next = new Set(current)
    if (present) {
      next.add(accountId)
    } else {
      next.delete(accountId)
    }
    return next
  })
}

const useAccountProfile = (options: UseAccountProfileOptions) => {
  const [drafts, setDrafts] = createStore<Record<string, AccountDraft>>({})
  const [busyIds, setBusyIds] = createSignal<ReadonlySet<AccountId>>(new Set())
  const [loadingIds, setLoadingIds] = createSignal<ReadonlySet<AccountId>>(new Set())
  const sources = new Map<AccountId, AccountConfig>()
  const storedUsernames = new Map<AccountId, string>()
  const loadedUsernames = new Set<AccountId>()
  const editedUsernames = new Set<AccountId>()
  const fibers: Fiber.Fiber<unknown, unknown>[] = []

  const initialize = (account: AccountConfig, username: string | undefined) => {
    sources.set(account.id, account)
    setDrafts(account.id, draftFromAccount(account, username))
  }

  for (const account of options.accounts()) {
    initialize(account, storedUsernames.get(account.id))
  }

  createEffect(() => {
    for (const account of options.accounts()) {
      if (sources.get(account.id) === account) {
        continue
      }
      editedUsernames.delete(account.id)
      initialize(account, storedUsernames.get(account.id))
    }
  })

  createEffect(() => {
    for (const account of options.accounts()) {
      if (loadedUsernames.has(account.id)) {
        continue
      }
      loadedUsernames.add(account.id)
      setMembership(setLoadingIds, account.id, true)
      const program = Effect.gen(function* loadStoredUsername() {
        const client = yield* MailClient
        const stored = yield* client.accountUsername(account.id).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              options.onStatus(
                `could not read the stored username for ${account.label} · ${describeClientFailure(error).message}`,
                true,
              )
              return null
            }),
          ),
        )
        yield* Effect.sync(() => {
          if (stored !== null) {
            storedUsernames.set(account.id, stored)
          }
          if (!editedUsernames.has(account.id)) {
            setDrafts(account.id, "username", stored ?? account.email)
          }
        })
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            setMembership(setLoadingIds, account.id, false)
          }),
        ),
      )
      fibers.push(options.runtime.runFork(program))
    }
  })

  const value = (accountId: AccountId, field: FieldId): string => {
    const draft = drafts[accountId]
    if (draft === undefined) {
      return ""
    }
    if (field === "imapSecurity") {
      return draft.imapSecurity
    }
    if (field === "smtpSecurity") {
      return draft.smtpSecurity
    }
    if (field === "saveSent") {
      return draft.saveSent ? "yes" : "no"
    }
    return draft[field]
  }

  const input = (accountId: AccountId, field: FieldId, next: string) => {
    if (
      field === "imapSecurity" ||
      field === "smtpSecurity" ||
      field === "password" ||
      field === "saveSent"
    ) {
      return
    }
    setDrafts(accountId, field, next)
    if (field === "username") {
      editedUsernames.add(accountId)
    }
  }

  const cycle = (accountId: AccountId, field: FieldId, delta: number) => {
    if (field === "imapSecurity") {
      setDrafts(accountId, "imapSecurity", (current) => cycleSecurity(current, delta))
      return
    }
    if (field === "smtpSecurity") {
      setDrafts(accountId, "smtpSecurity", (current) => cycleSecurity(current, delta))
      return
    }
    if (field === "saveSent") {
      setDrafts(accountId, "saveSent", (current) => !current)
    }
  }

  const applyKey = (accountId: AccountId, event: KeyEvent): boolean => {
    const next = applySecretKey(drafts[accountId]?.password ?? "", event)
    if (next === undefined) {
      return false
    }
    setDrafts(accountId, "password", next)
    return true
  }

  const restorePassword = (accountId: AccountId, password: string) => {
    setDrafts(accountId, "password", password)
  }

  const save = (accountId: AccountId) => {
    if (busyIds().has(accountId)) {
      return
    }
    const account = options.accounts().find((candidate) => candidate.id === accountId)
    const draft = drafts[accountId]
    if (account === undefined || draft === undefined) {
      return
    }
    const result = validateEditDraft(draft)
    if (result._tag === "error") {
      options.onStatus(result.message, true)
      return
    }
    setMembership(setBusyIds, accountId, true)
    options.onStatus("saving…")
    const program = Effect.gen(function* persistProfile() {
      const client = yield* MailClient
      yield* client.updateAccount(account.id, result.value).pipe(
        Effect.tap((updated) =>
          Effect.sync(() => {
            setMembership(setBusyIds, accountId, false)
            options.onStatus(`saved ${updated.label}`)
            options.onSaved(updated)
          }),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            setMembership(setBusyIds, accountId, false)
            const failure = describeClientFailure(error)
            if (failure._tag === "connection") {
              options.onDisconnected(failure.message)
              return
            }
            options.onStatus(`could not save · ${failure.message}`, true)
          }),
        ),
      )
    })
    fibers.push(options.runtime.runFork(program))
  }

  const dispose = () => {
    for (const fiber of fibers) {
      options.runtime.runFork(Fiber.interrupt(fiber))
    }
    fibers.length = 0
  }

  return {
    applyKey,
    busy: (accountId: AccountId) => busyIds().has(accountId),
    busyAny: () => busyIds().size > 0,
    cycle,
    dispose,
    input,
    loading: (accountId: AccountId) => loadingIds().has(accountId),
    restorePassword,
    save,
    value,
  }
}

export { useAccountProfile, type UseAccountProfileOptions }
