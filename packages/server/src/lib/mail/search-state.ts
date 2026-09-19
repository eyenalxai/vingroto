import type { AccountConfig } from "@vingroto/core/config/schema"
import type { AccountId, MailboxId, Uid } from "@vingroto/core/ids"

import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Ref from "effect/Ref"
import * as Scope from "effect/Scope"

interface RemoteSession {
  readonly accountId: AccountId
  readonly mailboxId: MailboxId
  readonly mailboxPath: string
  readonly terms: readonly string[]
  readonly unseenOnly: boolean
  readonly uids: readonly Uid[] | undefined
  readonly cursor: number
  readonly fetching: number | undefined
  readonly done: boolean
}

interface QueryEntry {
  readonly id: number
  readonly hits: ReadonlySet<string>
  readonly sessions: ReadonlyMap<string, RemoteSession>
  readonly updatedAt: number
  readonly scope: Scope.Closeable
}

interface PageClaim {
  readonly account: AccountConfig
  readonly key: string
  readonly session: RemoteSession
  readonly token: number
}

interface MailboxRef {
  readonly accountId: AccountId
  readonly id: MailboxId
  readonly path: string
}

interface PagePlan {
  readonly account: AccountConfig
  readonly token: number
}

interface EnsureResult {
  readonly dropped: readonly QueryEntry[]
  readonly found: QueryEntry | undefined
}

interface InsertResult {
  readonly dropped: readonly QueryEntry[]
  readonly entry: QueryEntry
}

const sessionKey = (accountId: AccountId, mailboxId: MailboxId) => `${accountId}\u0000${mailboxId}`

const updateEntry = (
  map: ReadonlyMap<string, QueryEntry>,
  normalized: string,
  entryId: number,
  update: (entry: QueryEntry) => QueryEntry,
): ReadonlyMap<string, QueryEntry> => {
  const current = map.get(normalized)
  if (current === undefined || current.id !== entryId) {
    return map
  }
  const next = update(current)
  if (next === current) {
    return map
  }
  const replaced: readonly [string, QueryEntry] = [normalized, next]
  return new Map([...map, replaced])
}

const updateSession = (
  map: ReadonlyMap<string, QueryEntry>,
  normalized: string,
  entryId: number,
  key: string,
  token: number,
  update: (session: RemoteSession) => RemoteSession,
): ReadonlyMap<string, QueryEntry> =>
  updateEntry(map, normalized, entryId, (entry) => {
    const session = entry.sessions.get(key)
    if (session === undefined || session.fetching !== token) {
      return entry
    }
    const sessions = new Map<string, RemoteSession>()
    for (const [currentKey, currentSession] of entry.sessions) {
      sessions.set(currentKey, currentKey === key ? update(currentSession) : currentSession)
    }
    return { ...entry, sessions }
  })

const finishSession = (
  states: Ref.Ref<ReadonlyMap<string, QueryEntry>>,
  normalized: string,
  entryId: number,
  key: string,
  token: number,
  uids: readonly Uid[],
  cursor: number,
  identities: readonly string[],
) =>
  Ref.update(states, (map) =>
    updateEntry(map, normalized, entryId, (entry) => {
      const session = entry.sessions.get(key)
      if (session === undefined || session.fetching !== token) {
        return entry
      }
      const sessions = new Map<string, RemoteSession>()
      for (const [currentKey, currentSession] of entry.sessions) {
        if (currentKey !== key) {
          sessions.set(currentKey, currentSession)
          continue
        }
        sessions.set(currentKey, {
          ...currentSession,
          uids,
          cursor,
          done: cursor >= uids.length,
          fetching: undefined,
        })
      }
      const hits = new Set(entry.hits)
      for (const identity of identities) {
        hits.add(identity)
      }
      return { ...entry, hits, sessions }
    }),
  )

const failSession = (
  states: Ref.Ref<ReadonlyMap<string, QueryEntry>>,
  normalized: string,
  entryId: number,
  key: string,
  token: number,
) =>
  Ref.update(states, (map) =>
    updateSession(map, normalized, entryId, key, token, (session) => {
      return { ...session, done: true }
    }),
  )

const clearFetching = (
  states: Ref.Ref<ReadonlyMap<string, QueryEntry>>,
  normalized: string,
  entryId: number,
  key: string,
  token: number,
) =>
  Ref.update(states, (map) =>
    updateSession(map, normalized, entryId, key, token, (session) => {
      return { ...session, fetching: undefined }
    }),
  )

const touchEntry = (
  map: ReadonlyMap<string, QueryEntry>,
  normalized: string,
  now: number,
  lifetimeMillis: number,
): readonly [EnsureResult, ReadonlyMap<string, QueryEntry>] => {
  const kept = new Map<string, QueryEntry>()
  const dropped: QueryEntry[] = []
  for (const [key, entry] of map) {
    if (key !== normalized && now - entry.updatedAt > lifetimeMillis) {
      dropped.push(entry)
      continue
    }
    kept.set(key, entry)
  }
  const found = kept.get(normalized)
  if (found === undefined) {
    return [{ dropped, found: undefined }, kept]
  }
  const touched: QueryEntry = { ...found, updatedAt: now }
  kept.set(normalized, touched)
  return [{ dropped, found: touched }, kept]
}

const insertEntry = (
  map: ReadonlyMap<string, QueryEntry>,
  normalized: string,
  created: QueryEntry,
  limit: number,
): readonly [InsertResult, ReadonlyMap<string, QueryEntry>] => {
  const current = map.get(normalized)
  if (current !== undefined) {
    return [{ dropped: [], entry: current }, map]
  }
  const inserted: readonly [string, QueryEntry] = [normalized, created]
  const next = new Map([...map, inserted])
  const dropped: QueryEntry[] = []
  while (next.size > limit) {
    const oldest = [...next.entries()]
      .filter(([key]) => key !== normalized)
      .toSorted((left, right) => left[1].updatedAt - right[1].updatedAt)
      .at(0)
    if (oldest === undefined) {
      break
    }
    dropped.push(oldest[1])
    next.delete(oldest[0])
  }
  return [{ dropped, entry: created }, next]
}

const closeEntries = Effect.fnUntraced(function* closeQueryEntries(entries: readonly QueryEntry[]) {
  for (const entry of entries) {
    yield* Scope.close(entry.scope, Exit.void)
  }
})

interface EnsureStateOptions {
  readonly entryIds: Ref.Ref<number>
  readonly layerScope: Scope.Scope
  readonly states: Ref.Ref<ReadonlyMap<string, QueryEntry>>
}

const makeEnsureState = (options: EnsureStateOptions) =>
  Effect.fnUntraced(function* ensureQueryState(
    normalized: string,
    lifetimeMillis: number,
    limit: number,
  ) {
    const now = yield* Clock.currentTimeMillis
    const ensured = yield* Ref.modify(options.states, (map) =>
      touchEntry(map, normalized, now, lifetimeMillis),
    )
    yield* closeEntries(ensured.dropped)
    if (ensured.found !== undefined) {
      return ensured.found
    }
    const id = yield* Ref.updateAndGet(options.entryIds, (current) => current + 1)
    const scope = yield* Scope.fork(options.layerScope)
    const created: QueryEntry = {
      id,
      hits: new Set(),
      sessions: new Map(),
      updatedAt: now,
      scope,
    }
    const inserted = yield* Ref.modify(options.states, (map) =>
      insertEntry(map, normalized, created, limit),
    )
    yield* closeEntries(inserted.dropped)
    if (inserted.entry !== created) {
      yield* Scope.close(created.scope, Exit.void)
    }
    return inserted.entry
  })

export {
  clearFetching,
  failSession,
  finishSession,
  makeEnsureState,
  sessionKey,
  type MailboxRef,
  type PageClaim,
  type PagePlan,
  type QueryEntry,
  type RemoteSession,
}
