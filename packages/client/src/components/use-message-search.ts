import type { MessageListItem, MessageTarget } from "@vingroto/core/protocol/mail"

import { Effect } from "effect"
import { createSignal, onCleanup, untrack } from "solid-js"

import type { MailClientError } from "@/lib/api"
import type { AppRuntime } from "@/lib/runtime"

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
  let remoteTimer: ReturnType<typeof setTimeout> | null = null

  const active = () => query().length > 0

  const reportFailure = (label: string, error: MailClientError) => {
    const failure = describeClientFailure(error)
    if (failure._tag === "connection") {
      options.onDisconnected(failure.message)
      return
    }
    options.onStatus(`${label} · ${failure.message}`)
  }

  const clearRemoteTimer = () => {
    if (remoteTimer !== null) {
      clearTimeout(remoteTimer)
      remoteTimer = null
    }
  }

  const runRemote = (scope: NonNullable<ReturnType<typeof parseListKey>>, value: string) => {
    const program = Effect.gen(function* startRemoteSearch() {
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
    options.runtime.runFork(program)
  }

  const scheduleRemote = (scope: NonNullable<ReturnType<typeof parseListKey>>, value: string) => {
    clearRemoteTimer()
    if (value.trim().length < minimumRemoteQueryLength || queryTerms(value).length === 0) {
      return
    }
    remoteTimer = setTimeout(() => {
      remoteTimer = null
      runRemote(scope, value)
    }, remoteSearchDelayMs)
  }

  const loadResults = (advance: boolean) => {
    untrack(() => {
      const key = options.listKey()
      const scope = parseListKey(key)
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
    clearRemoteTimer()
    if (next.length === 0) {
      return
    }
    loadResults(false)
    const scope = parseListKey(options.listKey())
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
    clearRemoteTimer()
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
    const scope = parseListKey(options.listKey())
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

  onCleanup(clearRemoteTimer)

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
