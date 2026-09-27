import type { ServerEvent } from "@vingroto/core/protocol/events"
import type { ListScope } from "@vingroto/core/protocol/mail"
import type { HttpClientError } from "effect/unstable/http"

import { BunServices } from "@effect/platform-bun"
import { AppPaths } from "@vingroto/core/app-paths"
import { describeError } from "@vingroto/core/errors"
import { LoggingLayer } from "@vingroto/core/logging"
import { Api } from "@vingroto/core/protocol/api"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Option from "effect/Option"
import * as PubSub from "effect/PubSub"
import * as Ref from "effect/Ref"
import * as Stream from "effect/Stream"
import { FetchHttpClient } from "effect/unstable/http"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import { HttpApiClient } from "effect/unstable/httpapi"

import type { MailClientError } from "@/lib/api"
import type { DaemonTarget } from "@/lib/daemon"

import { ClientDefect, MailClient } from "@/lib/api"
import { ClientConnection, describeOpenError } from "@/lib/connection"
import { resolveDaemon } from "@/lib/daemon"
import { makeClientMethods } from "@/lib/methods"
import { ServicesLayer } from "@/lib/services"

const listQuery = (scope: ListScope, limit: number) => {
  if (scope.kind === "mailbox") {
    return { scope: scope.kind, mailboxId: scope.mailboxId, limit }
  }
  if (scope.kind === "unread") {
    return scope.accountId === undefined
      ? { scope: scope.kind, limit }
      : { scope: scope.kind, accountId: scope.accountId, limit }
  }
  return { scope: scope.kind, limit }
}

const scopeFields = (scope: ListScope) => {
  if (scope.kind === "mailbox") {
    return { scope: scope.kind, mailboxId: scope.mailboxId }
  }
  if (scope.kind === "unread" && scope.accountId !== undefined) {
    return { scope: scope.kind, accountId: scope.accountId }
  }
  return { scope: scope.kind }
}

const MailClientLayer = Layer.unwrap(
  Effect.gen(function* makeClientLayer() {
    const paths = yield* AppPaths
    const fs = yield* FileSystem.FileSystem
    const base = yield* HttpClient.HttpClient
    const openErrors = yield* PubSub.unbounded<string>()
    const endpointChanges = yield* PubSub.unbounded<DaemonTarget | null>()
    const target = yield* Ref.make<DaemonTarget | null>(null)

    const publishOpenError = (message: string) =>
      PubSub.publish(openErrors, message).pipe(Effect.asVoid)

    const publishEndpoint = (value: DaemonTarget | null) =>
      PubSub.publish(endpointChanges, value).pipe(Effect.asVoid)

    // Lazy so the runtime builds without a daemon.
    // The cache is dropped on transport failures.
    // A restarted daemon on a new port or with a new token is picked up by the next attempt.
    const resolveTarget = Effect.gen(function* resolveTarget() {
      const cached = yield* Ref.get(target)
      if (cached !== null) {
        return cached
      }
      const resolved = yield* resolveDaemon({ fs, paths }, {}).pipe(
        Effect.tapError((error) => publishOpenError(describeOpenError(error))),
      )
      yield* Ref.set(target, resolved)
      yield* publishEndpoint(resolved)
      return resolved
    })

    const invalidateTarget = Effect.all([Ref.set(target, null), publishEndpoint(null)], {
      discard: true,
    })

    const reportTransportFailure = (error: HttpClientError.HttpClientError) => {
      if (error.reason._tag !== "TransportError" && error.reason._tag !== "InvalidUrlError") {
        return Effect.void
      }
      return Effect.all([invalidateTarget, publishOpenError(describeOpenError(error))], {
        discard: true,
      })
    }

    const httpClient = base.pipe(
      HttpClient.mapRequestEffect((request) =>
        resolveTarget.pipe(
          Effect.map((daemon) =>
            request.pipe(
              HttpClientRequest.updateUrl((url) => new URL(url, daemon.url).toString()),
              HttpClientRequest.bearerToken(daemon.token),
            ),
          ),
        ),
      ),
      HttpClient.transform((effect) =>
        Effect.tapError(effect, (error) =>
          error._tag === "HttpClientError" ? reportTransportFailure(error) : Effect.void,
        ),
      ),
    )

    const api = yield* HttpApiClient.makeWith(Api, { httpClient })

    const { clientMethod, readMethod } = makeClientMethods(invalidateTarget)

    // The daemon's SSE retry directive asks for a reconnect.
    // Obeying it here keeps the failure out of the client surface, where the ui cannot act on it.
    const subscribeToEvents = (): Stream.Stream<ServerEvent, MailClientError> =>
      Stream.unwrap(
        api.events["event.subscribe"]().pipe(
          Effect.mapError((error): MailClientError =>
            error._tag === "SchemaError"
              ? new ClientDefect({
                  operation: "MailClient.events",
                  message: describeError(error),
                })
              : error,
          ),
          Effect.map((events) =>
            events.pipe(
              Stream.catchTag("Retry", (retry) =>
                Stream.fromEffect(Effect.sleep(retry.duration)).pipe(
                  Stream.drain,
                  Stream.concat(subscribeToEvents()),
                ),
              ),
              Stream.tapError((error) => {
                if (error._tag === "HttpClientError") {
                  return reportTransportFailure(error)
                }
                return error._tag === "UnauthorizedError" ? invalidateTarget : Effect.void
              }),
              Stream.mapError((error): MailClientError => {
                if (error._tag === "SchemaError" || error._tag === "SseError") {
                  return new ClientDefect({
                    operation: "MailClient.events",
                    message: describeError(error),
                  })
                }
                return error
              }),
              Stream.catchDefect((defect) =>
                Stream.fail(
                  new ClientDefect({
                    operation: "MailClient.events",
                    message: describeError(defect),
                  }),
                ),
              ),
            ),
          ),
        ),
      )

    const mailClient = MailClient.of({
      accountUsername: (id) =>
        readMethod(
          "accountUsername",
          api.accounts["account.username"]({ params: { accountId: id } }).pipe(
            Effect.map((username) => Option.fromNullOr(username)),
          ),
        ),
      cancelOutbox: (outboxId) =>
        clientMethod("cancelOutbox", api.outbox["outbox.cancel"]({ params: { outboxId } })),
      createAccount: (input) =>
        clientMethod("createAccount", api.accounts["account.create"]({ payload: input })),
      deleteDraft: (draftId) =>
        clientMethod("deleteDraft", api.drafts["draft.delete"]({ params: { draftId } })),
      discover: (email) =>
        clientMethod("discover", api.accounts["account.discover"]({ payload: { email } })),
      enqueueMessage: (message) =>
        clientMethod("enqueueMessage", api.outbox["outbox.enqueue"]({ payload: message })),
      events: subscribeToEvents(),
      getMessage: (id) =>
        readMethod(
          "getMessage",
          api.messages["message.get"]({ params: { messageId: id } }).pipe(
            Effect.asSome,
            Effect.catchTag("MessageNotFoundError", () => Effect.succeedNone),
          ),
        ),
      listDrafts: readMethod("listDrafts", api.drafts["draft.list"]()),
      listMessages: (scope, limit) =>
        readMethod(
          "listMessages",
          api.messages["message.list"]({ query: listQuery(scope, limit) }),
        ),
      listOutbox: readMethod("listOutbox", api.outbox["outbox.list"]()),
      loadBody: (id) =>
        readMethod("loadBody", api.messages["message.body"]({ params: { messageId: id } })),
      mailboxSnapshot: readMethod("mailboxSnapshot", api.mailboxes["mailbox.snapshot"]()),
      moveMessages: (ids, targetMailboxId) =>
        clientMethod(
          "moveMessages",
          api.messages["message.move"]({ payload: { ids, targetMailboxId } }),
        ),
      releaseOutbox: (outboxId) =>
        clientMethod("releaseOutbox", api.outbox["outbox.release"]({ params: { outboxId } })),
      reorderAccounts: (accountIds) =>
        clientMethod(
          "reorderAccounts",
          api.accounts["account.reorder"]({ payload: { accountIds } }),
        ),
      saveDraft: (draft) => clientMethod("saveDraft", api.drafts["draft.save"]({ payload: draft })),
      saveEditorSettings: (editor) =>
        clientMethod(
          "saveEditorSettings",
          api.settings["settings.saveEditor"]({ payload: { editor } }),
        ),
      saveNotifications: (settings) =>
        clientMethod(
          "saveNotifications",
          api.settings["settings.saveNotifications"]({ payload: settings }),
        ),
      saveSendSettings: (settings) =>
        clientMethod("saveSendSettings", api.settings["settings.saveSend"]({ payload: settings })),
      saveSyncSettings: (settings) =>
        clientMethod(
          "saveSyncSettings",
          api.settings["settings.saveSyncSettings"]({ payload: settings }),
        ),
      searchMarks: (scope, query) =>
        readMethod(
          "searchMarks",
          api.search["search.marks"]({ query: { ...scopeFields(scope), query } }),
        ),
      searchMessages: (scope, query, limit) =>
        readMethod(
          "searchMessages",
          api.search["search.messages"]({ query: { ...scopeFields(scope), query, limit } }),
        ),
      setMailboxMuted: (mailboxId, muted) =>
        clientMethod(
          "setMailboxMuted",
          api.mailboxes["mailbox.setMuted"]({ params: { mailboxId }, payload: { muted } }),
        ),
      setSeen: (ids, seen) =>
        clientMethod("setSeen", api.messages["message.setSeen"]({ payload: { ids, seen } })),
      startSearch: (scope, query) =>
        clientMethod(
          "startSearch",
          api.search["search.start"]({ payload: { ...scopeFields(scope), query } }),
        ),
      status: readMethod("status", api.server["server.status"]()),
      sync: (request) => clientMethod("sync", api.sync["sync.run"]({ payload: request })),
      updateAccount: (id, input) =>
        clientMethod(
          "updateAccount",
          api.accounts["account.update"]({ params: { accountId: id }, payload: input }),
        ),
    })

    const connection = Layer.succeed(ClientConnection, {
      endpoint: Stream.concat(
        Stream.fromEffect(Ref.get(target).pipe(Effect.map((value) => value?.url))),
        Stream.fromPubSub(endpointChanges).pipe(Stream.map((value) => value?.url)),
      ),
      openErrors: Stream.fromPubSub(openErrors),
    })

    return Layer.merge(Layer.succeed(MailClient, mailClient), connection)
  }),
)

const Logging = LoggingLayer.client.pipe(Layer.provide(ServicesLayer))

// Why: platform services are composed once at the runtime entry so components never provide layers.
const ClientLayer = Layer.merge(
  Layer.merge(
    MailClientLayer.pipe(Layer.provide(FetchHttpClient.layer), Layer.provide(ServicesLayer)),
    Logging,
  ),
  BunServices.layer,
)

const createClientRuntime = () => ManagedRuntime.make(ClientLayer)

type AppRuntime = ReturnType<typeof createClientRuntime>

type AppRuntimeError = Layer.Error<typeof ClientLayer>

export { createClientRuntime, type AppRuntime, type AppRuntimeError }
