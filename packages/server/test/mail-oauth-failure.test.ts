import type { AccountConfig } from "@vingroto/core/config/schema"

import { AccountId } from "@vingroto/core/ids"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Stream from "effect/Stream"

import type { ImapShape } from "@/lib/mail/imap"

import { ServerEvents } from "@/lib/events"
import { MailActions } from "@/lib/mail/actions"
import { Imap } from "@/lib/mail/imap"
import { SyncEngine } from "@/lib/mail/sync"
import { NewMailNotifier } from "@/lib/notify/new-mail"
import { OAuthReauthorizationRequired } from "@/lib/oauth/errors"

import {
  accountConfig,
  makeFixture,
  seedMailboxes,
  seedMessages,
  writeConfig,
} from "./helpers/fixture"

const alpha = AccountId.make("alpha@example.com")

const oauthAccount: AccountConfig = {
  ...accountConfig(alpha, "Alpha"),
  auth: "oauth2",
  oauth: { provider: "gmail", clientId: "alpha-client.apps.googleusercontent.com" },
}

const unused = () => Effect.die("unused imap method")

const imapStub = (overrides: Partial<ImapShape>): ImapShape => ({
  appendMessage: unused,
  fetchEnvelopes: unused,
  fetchMailboxWindows: () => Stream.empty,
  fetchMessageSource: unused,
  fetchMessageSources: () => Stream.empty,
  listMailboxes: () => Effect.succeed([]),
  moveMessages: unused,
  searchMessages: unused,
  setFlags: unused,
  ...overrides,
})

describe("oauth failures in mail actions", () => {
  test("a revoked grant surfaces as an oauth action failure", async () => {
    const fixture = await makeFixture()
    try {
      await writeConfig(fixture, [oauthAccount])
      const message = "the Google authorization expired or was revoked; re-authorize the account"
      const imap = imapStub({
        setFlags: () => Effect.fail(new OAuthReauthorizationRequired({ message })),
      })
      const services = Layer.mergeAll(
        fixture.layers,
        Layer.succeed(Imap, Imap.of(imap)),
        ServerEvents.layer,
      )
      const runtime = ManagedRuntime.make(
        Layer.merge(services, MailActions.layer.pipe(Layer.provide(services))),
      )
      try {
        const outcome = await runtime.runPromise(
          Effect.gen(function* markSeen() {
            const mailboxes = yield* seedMailboxes([
              { account: alpha, path: "INBOX", specialUse: String.raw`\Inbox` },
            ])
            const messages = yield* seedMessages(mailboxes, [
              { account: alpha, path: "INBOX", uid: 10, messageId: "<x@x>" },
            ])
            const actions = yield* MailActions
            return yield* actions.setSeenByIds([messages.id(alpha, "INBOX", 10)], true)
          }),
        )
        expect(outcome).toEqual({
          affected: 0,
          errors: [
            {
              _tag: "oauth",
              accountId: alpha,
              mailboxPath: "INBOX",
              message,
              reauthorizationRequired: true,
            },
          ],
        })
      } finally {
        await runtime.dispose()
      }
    } finally {
      await fixture.cleanup()
    }
  })
})

describe("oauth failures in sync", () => {
  test("a revoked grant surfaces as an oauth sync failure", async () => {
    const fixture = await makeFixture()
    try {
      const message = "the Google authorization expired or was revoked; re-authorize the account"
      const imap = imapStub({
        listMailboxes: () => Effect.fail(new OAuthReauthorizationRequired({ message })),
      })
      const services = Layer.mergeAll(
        fixture.layers,
        Layer.succeed(Imap, Imap.of(imap)),
        ServerEvents.layer,
        Layer.succeed(NewMailNotifier, NewMailNotifier.of({ mailboxStored: () => Effect.void })),
      )
      const runtime = ManagedRuntime.make(
        Layer.merge(services, SyncEngine.layer.pipe(Layer.provide(services))),
      )
      try {
        const report = await runtime.runPromise(
          Effect.gen(function* syncAccount() {
            const engine = yield* SyncEngine
            const paths: readonly string[] | undefined = undefined
            return yield* engine.syncMailboxes(
              oauthAccount,
              { initialDays: 30, intervalMinutes: 5 },
              paths,
            )
          }),
        )
        expect(report).toEqual({
          accountId: alpha,
          mailboxes: 0,
          fetched: 0,
          stored: 0,
          errors: [{ _tag: "oauth", accountId: alpha, message, reauthorizationRequired: true }],
        })
      } finally {
        await runtime.dispose()
      }
    } finally {
      await fixture.cleanup()
    }
  })
})
