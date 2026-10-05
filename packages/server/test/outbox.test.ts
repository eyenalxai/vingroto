import type { MailAddress } from "@vingroto/core/mail/address"

import { AccountId } from "@vingroto/core/ids"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import { writeFile } from "node:fs/promises"

import { ServerEvents } from "@/lib/events"
import { Mailer } from "@/lib/mail/mailer"
import { SentCopies } from "@/lib/mail/sent"
import { OAuthReauthorizationRequired } from "@/lib/oauth/errors"
import { Outbox } from "@/lib/outbox"

import { accountConfig, makeFixture } from "./helpers/fixture"

const alpha = AccountId.make("alpha@example.com")

const to: readonly MailAddress[] = [{ address: "bob@example.com" }]

describe("outbox permanent failures", () => {
  test("a revoked grant fails the entry without retrying and points at settings", async () => {
    const fixture = await makeFixture()
    try {
      await writeFile(
        fixture.paths.config,
        JSON.stringify({ accounts: [accountConfig(alpha)], send: { delaySeconds: 0 } }),
      )
      const message = "alpha@example.com: the Google authorization expired or was revoked"
      const mailer = Layer.succeed(
        Mailer,
        Mailer.of({
          compile: () => Effect.die("unused in this test"),
          send: () => Effect.fail(new OAuthReauthorizationRequired({ message })),
        }),
      )
      const sentCopies = Layer.succeed(SentCopies, SentCopies.of({ save: () => Effect.void }))
      const services = Layer.mergeAll(fixture.layers, ServerEvents.layer, mailer, sentCopies)
      const runtime = ManagedRuntime.make(Outbox.layer.pipe(Layer.provide(services)))
      try {
        const entry = await runtime.runPromise(
          Effect.gen(function* enqueueMessage() {
            const outbox = yield* Outbox
            return yield* outbox.enqueue({
              accountId: alpha,
              to,
              cc: [],
              bcc: [],
              subject: "hello",
              body: "world",
              references: [],
            })
          }),
        )
        expect(entry.state).toBe("pending")
        const failed = await runtime.runPromise(
          Effect.gen(function* waitForFailure() {
            const outbox = yield* Outbox
            for (let poll = 0; poll < 50; poll += 1) {
              const current = (yield* outbox.list)[0]
              if (current !== undefined && current.state === "failed") {
                return current
              }
              yield* Effect.sleep("100 millis")
            }
            return yield* Effect.die(new Error("the outbox entry was never marked failed"))
          }),
        )
        expect(failed.id).toBe(entry.id)
        expect(failed.attempts).toBe(1)
        expect(failed.lastError).toContain(message)
        expect(failed.lastError).toContain("re-authorize the account in settings")
      } finally {
        await runtime.dispose()
      }
    } finally {
      await fixture.cleanup()
    }
  })
})
