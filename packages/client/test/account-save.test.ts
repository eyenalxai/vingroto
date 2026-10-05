import type { AccountConfig } from "@vingroto/core/config/schema"

import { BunServices } from "@effect/platform-bun"
import { AccountId } from "@vingroto/core/ids"
import { LoggingLayer } from "@vingroto/core/logging"
import { describe, expect, test } from "bun:test"
import { Deferred, Effect, Layer, ManagedRuntime, Stream } from "effect"

import type { AccountDraft } from "@/components/setup/form-model"
import type { MailClientShape } from "@/lib/api"
import type { AppRuntime } from "@/lib/runtime"

import { emptyDraft } from "@/components/setup/form-model"
import { escapeIntent, useAccountSave } from "@/components/setup/use-account-save"
import { MailClient } from "@/lib/api"
import { ClientConnection } from "@/lib/connection"
import { ServicesLayer } from "@/lib/services"

const account: AccountConfig = {
  id: AccountId.make("user@example.com"),
  label: "user@example.com",
  email: "user@example.com",
  auth: "password",
  saveSent: true,
  imap: { host: "imap.example.com", port: 993, security: "tls" },
  smtp: { host: "smtp.example.com", port: 465, security: "tls" },
}

const oauthDraft = (): AccountDraft => ({
  ...emptyDraft(),
  email: "user@example.com",
  auth: "oauth2",
  oauthClientId: "client-123",
  imapHost: "imap.example.com",
  imapPort: "993",
  smtpHost: "smtp.example.com",
  smtpPort: "465",
})

const makeRuntime = (client: Partial<MailClientShape>): AppRuntime => {
  const layer = Layer.mergeAll(
    Layer.mock(MailClient, client),
    Layer.succeed(ClientConnection, { endpoint: Stream.empty, openErrors: Stream.empty }),
    LoggingLayer.client,
  ).pipe(Layer.provide(ServicesLayer), Layer.provideMerge(BunServices.layer))
  return ManagedRuntime.make(layer)
}

const makeSave = (runtime: AppRuntime) => {
  const messages: string[] = []
  const saved: AccountConfig[] = []
  const save = useAccountSave({
    draft: oauthDraft(),
    discovering: () => false,
    onSaved: (value) => {
      saved.push(value)
    },
    report: (message) => {
      messages.push(message)
    },
    runtime,
  })
  return { messages, save, saved }
}

const waitFor = (predicate: () => boolean) =>
  Effect.runPromise(
    Effect.gen(function* waitForCondition() {
      while (!predicate()) {
        yield* Effect.sleep(1)
      }
    }),
  )

describe("account save cancellation", () => {
  test("escape cancels only while the sign-in is pending", () => {
    expect(escapeIntent("authorizing")).toBe("cancel-sign-in")
    expect(escapeIntent("creating")).toBe("keep-saving")
    expect(escapeIntent("idle")).toBe("leave")
  })

  test("cancel interrupts a pending sign-in and never creates the account", async () => {
    let authorizeCalls = 0
    let createCalls = 0
    const authorizeStarted = Deferred.makeUnsafe<null>()
    const runtime = makeRuntime({
      authorizeAccount: () =>
        Effect.gen(function* authorize() {
          authorizeCalls += 1
          yield* Deferred.succeed(authorizeStarted, null)
          return yield* Effect.never
        }),
      createAccount: () =>
        Effect.sync(() => {
          createCalls += 1
          return account
        }),
    })
    const { messages, save, saved } = makeSave(runtime)

    save.save()
    expect(save.phase()).toBe("authorizing")
    await runtime.runPromise(Deferred.await(authorizeStarted))

    expect(save.cancel()).toBe(true)
    await waitFor(() => save.phase() === "idle")

    expect(createCalls).toBe(0)
    expect(saved).toHaveLength(0)
    expect(messages.at(-1)).toBe("Google sign-in cancelled")
  })

  test("cancel during the account create leaves it running to completion", async () => {
    let createCalls = 0
    const createStarted = Deferred.makeUnsafe<null>()
    const createGate = Deferred.makeUnsafe<null>()
    const runtime = makeRuntime({
      authorizeAccount: () => Effect.void,
      createAccount: () =>
        Effect.gen(function* create() {
          createCalls += 1
          yield* Deferred.succeed(createStarted, null)
          yield* Deferred.await(createGate)
          return account
        }),
    })
    const { messages, save, saved } = makeSave(runtime)

    save.save()
    await runtime.runPromise(Deferred.await(createStarted))
    expect(save.phase()).toBe("creating")

    expect(save.cancel()).toBe(false)
    expect(save.phase()).toBe("creating")

    await runtime.runPromise(Deferred.succeed(createGate, null))
    await waitFor(() => save.phase() === "idle")

    expect(createCalls).toBe(1)
    expect(saved).toStrictEqual([account])
    expect(messages.at(-1)).toBe(`saved ${account.label}`)
  })

  test("dispose interrupts a create in flight", async () => {
    let createCalls = 0
    const createStarted = Deferred.makeUnsafe<null>()
    const createGate = Deferred.makeUnsafe<null>()
    const runtime = makeRuntime({
      authorizeAccount: () => Effect.void,
      createAccount: () =>
        Effect.gen(function* create() {
          createCalls += 1
          yield* Deferred.succeed(createStarted, null)
          yield* Deferred.await(createGate)
          return account
        }),
    })
    const { save, saved } = makeSave(runtime)

    save.save()
    await runtime.runPromise(Deferred.await(createStarted))
    expect(save.phase()).toBe("creating")

    save.dispose()
    await runtime.runPromise(Deferred.succeed(createGate, null))
    await waitFor(() => save.phase() === "idle")

    expect(createCalls).toBe(1)
    expect(saved).toHaveLength(0)
  })
})
