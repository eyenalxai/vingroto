import type { KeyEvent } from "@opentui/core"

import { Effect, Fiber } from "effect"
import { createEffect, createMemo, createSignal } from "solid-js"
import { createStore } from "solid-js/store"

import type { AccountDraft, FieldDescriptor, FieldId } from "@/components/setup/form-model"
import type { AccountConfig } from "@/lib/config/schema"
import type { AppRuntime } from "@/lib/runtime"

import {
  applySecretKey,
  cycleSecurity,
  editFields,
  emptyDraft,
  validateEditDraft,
} from "@/components/setup/form-model"
import { updateAccount } from "@/lib/config/accounts"
import { usernameReference } from "@/lib/credential/refs"
import { Credential } from "@/lib/credential/service"
import { describeError } from "@/lib/errors"

interface UseAccountProfileOptions {
  readonly runtime: AppRuntime
  readonly account: () => AccountConfig | undefined
  readonly active: () => boolean
  readonly onSaved: (account: AccountConfig) => void
}

const draftFromAccount = (account: AccountConfig): AccountDraft => {
  return {
    ...emptyDraft(),
    email: account.email,
    label: account.label,
    name: account.name ?? "",
    username: account.email,
    imapHost: account.imap.host,
    imapPort: String(account.imap.port),
    imapSecurity: account.imap.security,
    smtpHost: account.smtp.host,
    smtpPort: String(account.smtp.port),
    smtpSecurity: account.smtp.security,
  }
}

const useAccountProfile = (options: UseAccountProfileOptions) => {
  const [draft, setDraft] = createStore<AccountDraft>(emptyDraft())
  const [focusIndex, setFocusIndex] = createSignal(0)
  const [status, setStatus] = createSignal("")
  const [statusError, setStatusError] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const fields: readonly FieldDescriptor[] = editFields
  let usernameEdited = false
  let loadedUsernameId: string | null = null
  let usernameFiber: Fiber.Fiber<unknown, unknown> | null = null

  const focusedField = createMemo(() => fields[focusIndex()])

  const report = (message: string, isError = false) => {
    setStatus(message)
    setStatusError(isError)
  }

  createEffect(() => {
    const account = options.account()
    if (account === undefined) {
      return
    }
    setDraft(draftFromAccount(account))
    setFocusIndex(0)
    setBusy(false)
    report("")
    usernameEdited = false
  })

  createEffect(() => {
    const account = options.account()
    if (account === undefined || !options.active() || loadedUsernameId === account.id) {
      return
    }
    loadedUsernameId = account.id
    const program = Effect.gen(function* loadStoredUsername() {
      const credential = yield* Credential
      const stored = yield* credential.get(usernameReference(account.id)).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            if (options.account()?.id === account.id) {
              report(`could not read the stored username · ${describeError(error)}`, true)
            }
            return account.email
          }),
        ),
      )
      yield* Effect.sync(() => {
        if (!usernameEdited && options.account()?.id === account.id) {
          setDraft("username", stored)
        }
      })
    })
    usernameFiber = options.runtime.runFork(program)
  })

  const fieldValue = (id: FieldId): string => {
    if (id === "imapSecurity") {
      return draft.imapSecurity
    }
    if (id === "smtpSecurity") {
      return draft.smtpSecurity
    }
    return draft[id]
  }

  const moveFocus = (delta: number) => {
    const count = fields.length
    setFocusIndex((current) => (current + delta + count) % count)
  }

  const cycleField = (id: FieldId, delta: number) => {
    if (id === "imapSecurity") {
      setDraft("imapSecurity", (current) => cycleSecurity(current, delta))
      return
    }
    if (id === "smtpSecurity") {
      setDraft("smtpSecurity", (current) => cycleSecurity(current, delta))
    }
  }

  const input = (id: FieldId, value: string) => {
    if (id === "imapSecurity" || id === "smtpSecurity" || id === "password") {
      return
    }
    setDraft(id, value)
    if (id === "username") {
      usernameEdited = true
    }
  }

  const applySecret = (event: KeyEvent) => {
    const next = applySecretKey(draft.password, event)
    if (next !== undefined) {
      setDraft("password", next)
    }
  }

  const appendPassword = (text: string) => {
    setDraft("password", (current: string) => current + text)
  }

  const save = () => {
    const account = options.account()
    if (account === undefined || busy()) {
      return
    }
    const result = validateEditDraft(draft)
    if (result._tag === "error") {
      report(result.message, true)
      return
    }
    setBusy(true)
    report("saving…")
    const program = Effect.gen(function* persistProfile() {
      yield* updateAccount(account.id, result.value).pipe(
        Effect.tap((updated) =>
          Effect.sync(() => {
            setBusy(false)
            report(`saved ${updated.label}`)
            options.onSaved(updated)
          }),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            setBusy(false)
            report(`could not save · ${describeError(error)}`, true)
          }),
        ),
      )
    })
    options.runtime.runFork(program)
  }

  const handleKey = (event: KeyEvent): boolean => {
    if (event.ctrl && event.name === "s") {
      save()
      return true
    }
    if (event.name === "tab") {
      moveFocus(event.shift ? -1 : 1)
      return true
    }
    if (event.name === "down" && !event.shift) {
      moveFocus(1)
      return true
    }
    if (event.name === "up" && !event.shift) {
      moveFocus(-1)
      return true
    }
    const active = focusedField()
    if (active === undefined) {
      return false
    }
    if (event.name === "return") {
      if (focusIndex() === fields.length - 1) {
        save()
      } else {
        moveFocus(1)
      }
      return true
    }
    if (active.kind === "secret") {
      applySecret(event)
      return true
    }
    if (active.kind === "security") {
      const backward = event.name === "left" || event.name === "h"
      const forward = event.name === "right" || event.name === "l" || event.name === "space"
      if (backward || forward) {
        cycleField(active.id, backward ? -1 : 1)
        return true
      }
      return false
    }
    return false
  }

  const dispose = () => {
    if (usernameFiber !== null) {
      options.runtime.runFork(Fiber.interrupt(usernameFiber))
      usernameFiber = null
    }
  }

  return {
    appendPassword,
    busy,
    dispose,
    fieldValue,
    fields,
    focusedField,
    handleKey,
    input,
    save,
    status,
    statusError,
  }
}

export { useAccountProfile, type UseAccountProfileOptions }
