import type { ListScope, MessageListItem, MessageTarget } from "@vingroto/core/protocol/mail"

import { Duration, Effect, Fiber } from "effect"
import { createSignal, onCleanup, untrack } from "solid-js"

import type { MailClientError } from "@/lib/api"
import type { AppRuntime, AppRuntimeError } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"
import { parseListKey } from "@/lib/mail/mailbox-tree"
import { queryTerms } from "@/lib/search"

const searchWindowSize = 100
const remoteSearchDelayMs = 350
const minimumRemoteQueryLength = 2

interface MessageSearchOptions {
  readonly runtime: AppRuntime
  readonly listKey: () => string | undefined
  readonly onStatus: (status: string) => void
  readonly onDisconnected: (message: string) => void
  readonly applyRows: (rows: readonly MessageListItem[]) => void
  readonly onQueryChanged: () => void
}

const useMessageSearch = (options: MessageSearchOptions) => {
  const [editing, setEditing] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [hasMore, setHasMore] = createSignal(false)
  const [windowSize, setWindowSize] = createSignal(searchWindowSize)
  let loadToken = 0
  let remoteFiber: Fiber.Fiber<void, AppRuntimeError> | null = null

  const active = () => query().length > 0

  const searchScope = (): ListScope | undefined => {
    const scope = parseListKey(options.listKey())
    if (scope === undefined || scope.kind === "outbox" || scope.kind === "drafts") {
      return undefined
    }
    return scope
  }

  const reportFailure = (label: string, error: MailClientError) => {
    const failure = describeClientFailure(error)
    if (failure._tag === "connection") {
      options.onDisconnected(failure.message)
      return
    }
    options.onStatus(`${label} · ${failure.message}`)
  }

  const cancelRemote = () => {
    if (remoteFiber !== null) {
      options.runtime.runFork(Fiber.interrupt(remoteFiber))
      remoteFiber = null
    }
  }

  const remoteSearch = (scope: ListScope, value: string): Effect.Effect<void, never, MailClient> =>
    Effect.gen(function* startRemoteSearch() {
      const client = yield* MailClient
      yield* client.startSearch(scope, value)
    }).pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          Effect.sync(() => {
            reportFailure("could not search the server", error)
          }),
        onSuccess: () => Effect.void,
      }),
    )

  const scheduleRemote = (scope: ListScope, value: string) => {
    cancelRemote()
    if (value.trim().length < minimumRemoteQueryLength || queryTerms(value).length === 0) {
      return
    }
    remoteFiber = options.runtime.runFork(
      remoteSearch(scope, value).pipe(Effect.delay(Duration.millis(remoteSearchDelayMs))),
    )
  }

  const loadResults = (advance: boolean) => {
    untrack(() => {
      const key = options.listKey()
      const scope = searchScope()
      const value = query()
      const limit = windowSize()
      if (key === undefined || scope === undefined || value.length === 0) {
        return
      }
      loadToken += 1
      const token = loadToken
      const program = Effect.gen(function* loadSearchRows() {
        const client = yield* MailClient
        const outcome = yield* client.searchMessages(scope, value, limit)
        yield* Effect.sync(() => {
          // Results may arrive after the query, the scope or the window changed.
          if (token !== loadToken || options.listKey() !== key || query() !== value) {
            return
          }
          options.applyRows(outcome.messages)
          setHasMore(outcome.hasMore)
        })
        if (advance) {
          yield* client.startSearch(scope, value)
        }
      }).pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            Effect.sync(() => {
              reportFailure("could not search the messages", error)
            }),
          onSuccess: () => Effect.void,
        }),
      )
      options.runtime.runFork(program)
    })
  }

  const updateQuery = (next: string) => {
    setQuery(next)
    setWindowSize(searchWindowSize)
    setHasMore(false)
    options.onQueryChanged()
    cancelRemote()
    if (next.length === 0) {
      return
    }
    loadResults(false)
    const scope = searchScope()
    if (scope !== undefined) {
      scheduleRemote(scope, next)
    }
  }

  const begin = () => {
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
  }

  const cancel = () => {
    cancelRemote()
    setEditing(false)
    setQuery("")
    setWindowSize(searchWindowSize)
    setHasMore(false)
    options.onQueryChanged()
  }

  const reload = () => {
    if (active()) {
      loadResults(false)
    }
  }

  const grow = () => {
    if (!active() || !hasMore()) {
      return
    }
    setWindowSize(windowSize() + searchWindowSize)
    loadResults(true)
  }

  const fetchMarks = (onLoaded: (targets: readonly MessageTarget[]) => void) => {
    const scope = searchScope()
    const value = query()
    if (scope === undefined || value.length === 0) {
      return
    }
    const program = Effect.gen(function* loadSearchMarks() {
      const client = yield* MailClient
      const targets = yield* client.searchMarks(scope, value)
      yield* Effect.sync(() => {
        onLoaded(targets)
      })
    }).pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          Effect.sync(() => {
            reportFailure("could not mark the search results", error)
          }),
        onSuccess: () => Effect.void,
      }),
    )
    options.runtime.runFork(program)
  }

  onCleanup(cancelRemote)

  return {
    active,
    begin,
    cancel,
    commit,
    editing,
    fetchMarks,
    grow,
    hasMore,
    query,
    reload,
    updateQuery,
  }
}

export { useMessageSearch, type MessageSearchOptions }
