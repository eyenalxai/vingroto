import type { KeyEvent } from "@opentui/core"
import type { AccountConfig } from "@vingroto/core/config/schema"
import type { DiscoveryResult } from "@vingroto/core/protocol/accounts"

import { Effect, Fiber } from "effect"
import { createEffect, createMemo, createSignal } from "solid-js"
import { createStore } from "solid-js/store"

import type {
  AccountDraft,
  FieldDescriptor,
  FieldId,
  SecretFieldId,
  TextFieldId,
} from "@/components/setup/form-model"
import type { AppRuntimeError } from "@/lib/runtime"

import { useRuntime } from "@/components/runtime-provider"
import { authForDraft, credentialFields, cycleAuth } from "@/components/setup/credential-fields"
import {
  cycleSecurity,
  emptyDraft,
  isServerField,
  serverFields,
} from "@/components/setup/form-model"
import { applySecretKey } from "@/components/setup/secret-key"
import { useAccountSave } from "@/components/setup/use-account-save"
import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"

interface UseAccountSetupOptions {
  readonly accounts: readonly AccountConfig[]
  readonly onSaved: (account: AccountConfig) => void
}

const useAccountSetup = (options: UseAccountSetupOptions) => {
  const runtime = useRuntime()
  const [draft, setDraft] = createStore<AccountDraft>(emptyDraft())
  const [step, setStep] = createSignal<"credentials" | "servers">("credentials")
  const [focusIndex, setFocusIndex] = createSignal(0)
  const [status, setStatus] = createSignal("")
  const [statusError, setStatusError] = createSignal(false)
  const [discovering, setDiscovering] = createSignal(false)
  const [source, setSource] = createSignal<string | undefined>()
  const [serversEdited, setServersEdited] = createSignal(false)
  let discoveryFiber: Fiber.Fiber<void, AppRuntimeError> | null = null

  const report = (message: string, isError = false) => {
    setStatus(message)
    setStatusError(isError)
  }

  const accountSave = useAccountSave({
    draft,
    discovering,
    onSaved: options.onSaved,
    report,
  })

  const fields = createMemo<readonly FieldDescriptor[]>(() =>
    step() === "credentials" ? credentialFields(draft) : serverFields,
  )
  const focusedField = createMemo(() => fields()[focusIndex()])
  const auth = createMemo(() => authForDraft(draft))

  createEffect(() => {
    const count = fields().length
    if (focusIndex() >= count) {
      setFocusIndex(count - 1)
    }
  })

  const fieldValue = (id: FieldId): string => {
    if (id === "auth") {
      return draft.auth
    }
    if (id === "imapSecurity") {
      return draft.imapSecurity
    }
    if (id === "smtpSecurity") {
      return draft.smtpSecurity
    }
    if (id === "saveSent") {
      return draft.saveSent ? "yes" : "no"
    }
    return draft[id]
  }

  const moveFocus = (delta: number) => {
    const count = fields().length
    setFocusIndex((current) => (current + delta + count) % count)
  }

  const goToStep = (next: "credentials" | "servers") => {
    if (next === "servers") {
      const existing = options.accounts.find(
        (account) => account.email.trim().toLowerCase() === draft.email.trim().toLowerCase(),
      )
      if (draft.label.trim().length === 0) {
        setDraft("label", existing?.label ?? draft.email.trim())
      }
      if (draft.name.trim().length === 0 && existing?.name !== undefined) {
        setDraft("name", existing.name)
      }
    }
    setStep(next)
    setFocusIndex(0)
  }

  const cycleField = (id: FieldId, delta: number) => {
    if (id === "auth") {
      setDraft("auth", (current) => cycleAuth(current, delta))
      return
    }
    if (id === "imapSecurity") {
      setDraft("imapSecurity", (current) => cycleSecurity(current, delta))
      return
    }
    if (id === "smtpSecurity") {
      setDraft("smtpSecurity", (current) => cycleSecurity(current, delta))
    }
  }

  const prefill = (id: TextFieldId, value: string) => {
    setDraft(id, value)
  }

  const applyDiscovery = (result: DiscoveryResult) => {
    if (result._tag === "not-found") {
      report(result.attempts[0] ?? "no servers found, enter them manually", true)
      return
    }
    const servers = result.servers
    setSource(servers.source)
    if (!serversEdited()) {
      prefill("imapHost", servers.imap.host)
      prefill("imapPort", String(servers.imap.port))
      setDraft("imapSecurity", servers.imap.security)
      prefill("smtpHost", servers.smtp.host)
      prefill("smtpPort", String(servers.smtp.port))
      setDraft("smtpSecurity", servers.smtp.security)
    }
    if (draft.username.trim().length === 0 && servers.username !== undefined) {
      prefill("username", servers.username)
    }
    report(`servers from ${servers.source}`)
  }

  const startDiscovery = () => {
    const email = draft.email.trim()
    if (email.length === 0 || discovering()) {
      return
    }
    setDiscovering(true)
    setSource(undefined)
    report("detecting mail servers…")
    const program = Effect.gen(function* runDiscovery() {
      const client = yield* MailClient
      yield* client.discover(email).pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            applyDiscovery(result)
          }),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            report(`server detection failed · ${describeClientFailure(error).message}`, true)
          }),
        ),
      )
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          setDiscovering(false)
        }),
      ),
    )
    discoveryFiber = runtime.runFork(program)
  }

  const enter = () => {
    const active = focusedField()
    if (active === undefined) {
      return
    }
    if (step() === "credentials") {
      if (active.id === "email") {
        moveFocus(1)
        return
      }
      goToStep("servers")
      startDiscovery()
      return
    }
    if (focusIndex() === fields().length - 1) {
      accountSave.save()
      return
    }
    moveFocus(1)
  }

  const input = (id: FieldId, value: string) => {
    if (
      id === "auth" ||
      id === "imapSecurity" ||
      id === "smtpSecurity" ||
      id === "password" ||
      id === "oauthClientSecret" ||
      id === "saveSent"
    ) {
      return
    }
    setDraft(id, value)
    if (isServerField(id)) {
      setServersEdited(true)
    }
  }

  const secretField = (): SecretFieldId | undefined => {
    const active = focusedField()
    if (active === undefined) {
      return undefined
    }
    return active.id === "password" || active.id === "oauthClientSecret" ? active.id : undefined
  }

  const applySecret = (event: KeyEvent) => {
    const id = secretField()
    if (id === undefined) {
      return
    }
    const next = applySecretKey(draft[id], event)
    if (next !== undefined) {
      setDraft(id, next)
    }
  }

  const appendSecret = (text: string) => {
    const id = secretField()
    if (id === undefined) {
      return
    }
    setDraft(id, (current: string) => current + text)
  }

  const dispose = () => {
    if (discoveryFiber !== null) {
      runtime.runFork(Fiber.interrupt(discoveryFiber))
    }
    accountSave.dispose()
  }

  return {
    appendSecret,
    applySecret,
    auth,
    authorizing: accountSave.authorizing,
    busy: accountSave.busy,
    cancel: accountSave.cancel,
    cycleField,
    discovering,
    dispose,
    draft,
    enter,
    fieldValue,
    fields,
    focusedField,
    goToStep,
    input,
    moveFocus,
    save: accountSave.save,
    source,
    status,
    statusError,
    step,
  }
}

export { useAccountSetup, type UseAccountSetupOptions }
