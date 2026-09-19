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

const ServicesLayer = Layer.mergeAll(AppPaths.layer).pipe(Layer.provideMerge(BunServices.layer))

// The logger is built alongside the services so anything below it logs to the file instead of stdout.
const InfraLayer = Layer.mergeAll(
  ServicesLayer,
  LoggingLayer.client.pipe(Layer.provide(ServicesLayer)),
)

// Defects would otherwise kill the calling fiber silently, so the ui can report them as a failure.
// Schema errors are contract mismatches the caller cannot act on, so they belong in the same bucket.
const guard = <A, E extends { readonly _tag: string }>(effect: Effect.Effect<A, E>) =>
  effect.pipe(
    Effect.catchDefect((defect) =>
      Effect.fail(new ClientDefect({ message: describeError(defect) })),
    ),
    Effect.catchIf(
      (error): error is Extract<E, { readonly _tag: "SchemaError" }> =>
        error._tag === "SchemaError",
      (error) => Effect.fail(new ClientDefect({ message: describeError(error) })),
    ),
  )

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

const ClientLayer = Layer.unwrap(
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
      const resolved = yield* resolveDaemon({}).pipe(
        Effect.provideService(AppPaths, paths),
        Effect.provideService(FileSystem.FileSystem, fs),
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

    const mailClient = MailClient.of({
      accountUsername: (id) =>
        guard(
          api.accounts["account.username"]({ params: { accountId: id } }).pipe(
            Effect.catchTag("AccountNotFoundError", () => Effect.succeed(null)),
          ),
        ),
      createAccount: (input) => guard(api.accounts["account.create"]({ payload: input })),
      discover: (email) => guard(api.accounts["account.discover"]({ payload: { email } })),
      events: Stream.unwrap(
        api.events["event.subscribe"]().pipe(
          Effect.mapError((error): MailClientError =>
            error._tag === "SchemaError"
              ? new ClientDefect({ message: describeError(error) })
              : error,
          ),
          Effect.map((events) =>
            events.pipe(
              Stream.catchDefect((defect) =>
                Stream.fail(new ClientDefect({ message: describeError(defect) })),
              ),
              Stream.tapError((error) =>
                error._tag === "HttpClientError" ? reportTransportFailure(error) : Effect.void,
              ),
              Stream.mapError((error): MailClientError => {
                if (error._tag === "SchemaError" || error._tag === "SseError") {
                  return new ClientDefect({ message: describeError(error) })
                }
                if (error._tag === "Retry") {
                  return new ClientDefect({
                    message: "the daemon asked the event stream to reconnect",
                  })
                }
                return error
              }),
            ),
          ),
        ),
      ),
      mailboxSnapshot: () => guard(api.mailboxes["mailbox.snapshot"]()),
      getMessage: (id) =>
        guard(
          api.messages["message.get"]({ params: { messageId: id } }).pipe(
            Effect.catchTag("MessageNotFoundError", () => Effect.succeed(null)),
          ),
        ),
      listMessages: (scope, limit) =>
        guard(api.messages["message.list"]({ query: listQuery(scope, limit) })),
      loadBody: (id) => guard(api.messages["message.body"]({ params: { messageId: id } })),
      moveMessages: (ids, targetMailboxId) =>
        guard(api.messages["message.move"]({ payload: { ids, targetMailboxId } })),
      searchMessages: (scope, query, limit) =>
        guard(api.search["search.messages"]({ query: { ...scopeFields(scope), query, limit } })),
      searchMarks: (scope, query) =>
        guard(api.search["search.marks"]({ query: { ...scopeFields(scope), query } })),
      startSearch: (scope, query) =>
        guard(api.search["search.start"]({ payload: { ...scopeFields(scope), query } })),
      reorderAccounts: (accountIds) =>
        guard(api.accounts["account.reorder"]({ payload: { accountIds } })),
      saveNotifications: (settings) =>
        guard(api.settings["settings.saveNotifications"]({ payload: settings })),
      saveSendSettings: (settings) =>
        guard(api.settings["settings.saveSend"]({ payload: settings })),
      saveSyncSettings: (settings) =>
        guard(api.settings["settings.saveSyncSettings"]({ payload: settings })),
      setMailboxMuted: (mailboxId, muted) =>
        guard(api.mailboxes["mailbox.setMuted"]({ params: { mailboxId }, payload: { muted } })),
      setSeen: (ids, seen) => guard(api.messages["message.setSeen"]({ payload: { ids, seen } })),
      status: () => guard(api.server["server.status"]()),
      sync: (request) => guard(api.sync["sync.run"]({ payload: request })),
      updateAccount: (id, input) =>
        guard(api.accounts["account.update"]({ params: { accountId: id }, payload: input })),
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
).pipe(Layer.provide(FetchHttpClient.layer), Layer.provideMerge(InfraLayer))

const createClientRuntime = () => ManagedRuntime.make(ClientLayer)

type AppRuntime = ReturnType<typeof createClientRuntime>

export { createClientRuntime, type AppRuntime }
