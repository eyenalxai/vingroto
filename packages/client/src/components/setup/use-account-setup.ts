import type { KeyEvent } from "@opentui/core"
import type { AccountConfig } from "@vingroto/core/config/schema"
import type { DiscoveryResult } from "@vingroto/core/protocol/accounts"

import { Effect, Fiber } from "effect"
import { createMemo, createSignal } from "solid-js"
import { createStore } from "solid-js/store"

import type {
  AccountDraft,
  FieldDescriptor,
  FieldId,
  TextFieldId,
} from "@/components/setup/form-model"

import { useRuntime } from "@/components/runtime-provider"
import {
  applySecretKey,
  credentialFields,
  cycleSecurity,
  emptyDraft,
  isServerField,
  serverFields,
  validateDraft,
} from "@/components/setup/form-model"
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
  const [busy, setBusy] = createSignal(false)
  const [discovering, setDiscovering] = createSignal(false)
  const [source, setSource] = createSignal<string | undefined>()
  const [serversEdited, setServersEdited] = createSignal(false)
  let discoveryFiber: Fiber.Fiber<unknown, unknown> | null = null

  const report = (message: string, isError = false) => {
    setStatus(message)
    setStatusError(isError)
  }

  const fields = createMemo<readonly FieldDescriptor[]>(() =>
    step() === "credentials" ? credentialFields : serverFields,
  )
  const focusedField = createMemo(() => fields()[focusIndex()])

  const fieldValue = (id: FieldId): string => {
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

  const save = () => {
    if (busy()) {
      return
    }
    if (discovering()) {
      report("waiting for server detection to finish…")
      return
    }
    const result = validateDraft(draft)
    if (result._tag === "error") {
      report(result.message, true)
      return
    }
    setBusy(true)
    report("saving account…")
    const program = Effect.gen(function* persistAccount() {
      const client = yield* MailClient
      yield* client.createAccount(result.value).pipe(
        Effect.tap((account) =>
          Effect.sync(() => {
            report(`saved ${account.label}`)
            options.onSaved(account)
          }),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            report(`could not save · ${describeClientFailure(error).message}`, true)
          }),
        ),
      )
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          setBusy(false)
        }),
      ),
    )
    runtime.runFork(program)
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
      save()
      return
    }
    moveFocus(1)
  }

  const input = (id: FieldId, value: string) => {
    if (id === "imapSecurity" || id === "smtpSecurity" || id === "password" || id === "saveSent") {
      return
    }
    setDraft(id, value)
    if (isServerField(id)) {
      setServersEdited(true)
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

  const dispose = () => {
    if (discoveryFiber !== null) {
      runtime.runFork(Fiber.interrupt(discoveryFiber))
    }
  }

  return {
    appendPassword,
    applySecret,
    busy,
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
    save,
    source,
    status,
    statusError,
    step,
  }
}

export { useAccountSetup, type UseAccountSetupOptions }
