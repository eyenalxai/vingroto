import type { AccountConfig } from "@vingroto/core/config/schema"
import type { AccountId, MailboxId, Uid } from "@vingroto/core/ids"
import type { ListScope, MessageTarget, SearchOutcome } from "@vingroto/core/protocol/mail"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

import { AppPaths } from "@vingroto/core/app-paths"
import { describeError } from "@vingroto/core/errors"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

import type { ConfigInvalid, ConfigUnreadable } from "@/lib/config/load"
import type { ImapServiceError } from "@/lib/mail/imap-types"

import { loadConfigFile } from "@/lib/config/load"
import { Database } from "@/lib/db/database"
import { ServerEvents } from "@/lib/events"
import { Imap } from "@/lib/mail/imap"
import { matchRows, queryTerms, toListItem } from "@/lib/mail/search-match"
import {
  listMessageTargets,
  listSearchMailboxes,
  messageIdentitiesForUids,
} from "@/lib/store/message-search"
import { storeMessages } from "@/lib/store/messages"

interface SearchRequest {
  readonly scope: ListScope
  readonly query: string
}

type SearchError = ConfigInvalid | ConfigUnreadable | ImapServiceError | EffectDrizzleQueryError

interface RemoteSession {
  readonly accountId: AccountId
  readonly mailboxId: MailboxId
  readonly mailboxPath: string
  readonly terms: readonly string[]
  readonly unseenOnly: boolean
  uids: readonly Uid[] | undefined
  cursor: number
  fetching: boolean
  done: boolean
}

interface QueryState {
  readonly hits: Set<string>
  readonly sessions: Map<string, RemoteSession>
  updatedAt: number
}

interface SearchShape {
  readonly messages: (
    request: SearchRequest,
    limit: number,
  ) => Effect.Effect<SearchOutcome, SearchError>
  readonly marks: (request: SearchRequest) => Effect.Effect<readonly MessageTarget[], SearchError>
  readonly start: (request: SearchRequest) => Effect.Effect<void, SearchError>
}

const remotePageSize = 100
const remoteTermLimit = 5
const rememberedQueryLimit = 20
const queryLifetimeMillis = 30 * 60 * 1000

const normalizeQuery = (query: string) => query.trim().replaceAll(/\s+/gu, " ").toLowerCase()

class Search extends Context.Service<Search, SearchShape>()("vingroto/lib/mail/Search") {
  static readonly layer = Layer.effect(
    Search,
    Effect.gen(function* makeSearch() {
      const database = yield* Database
      const imap = yield* Imap
      const events = yield* ServerEvents
      const paths = yield* AppPaths
      const fs = yield* FileSystem.FileSystem
      const layerScope = yield* Effect.scope
      const states = yield* Ref.make(new Map<string, QueryState>())
      const readConfig = loadConfigFile(paths.config, fs)

      const ensureState = Effect.fnUntraced(function* ensureQueryState(normalized: string) {
        const now = yield* Clock.currentTimeMillis
        const map = yield* Ref.get(states)
        for (const [key, existing] of map) {
          if (key !== normalized && now - existing.updatedAt > queryLifetimeMillis) {
            map.delete(key)
          }
        }
        const found = map.get(normalized)
        if (found !== undefined) {
          found.updatedAt = now
          return found
        }
        const created: QueryState = { hits: new Set(), sessions: new Map(), updatedAt: now }
        map.set(normalized, created)
        while (map.size > rememberedQueryLimit) {
          const oldest = [...map.entries()]
            .toSorted((left, right) => left[1].updatedAt - right[1].updatedAt)
            .at(0)
          if (oldest === undefined || oldest[0] === normalized) {
            break
          }
          map.delete(oldest[0])
        }
        return created
      })

      const storeRemotePage = Effect.fn("Search.storeRemotePage")(
        function* storePage(account: AccountConfig, state: QueryState, session: RemoteSession) {
          const known =
            session.uids ??
            (yield* imap.searchMessages(
              account,
              session.mailboxPath,
              session.terms,
              session.unseenOnly,
            ))
          session.uids = known
          const page = known.slice(session.cursor, session.cursor + remotePageSize)
          if (page.length === 0) {
            session.done = true
            return
          }
          const envelopes = yield* imap.fetchEnvelopes(account, session.mailboxPath, page)
          yield* storeMessages({
            accountId: session.accountId,
            mailboxId: session.mailboxId,
            envelopes,
          })
          const identities = yield* messageIdentitiesForUids(session.mailboxId, page)
          for (const identity of identities) {
            state.hits.add(identity)
          }
          session.cursor += page.length
          session.done = session.cursor >= known.length
          yield* Effect.logInfo("remote search page stored").pipe(
            Effect.annotateLogs({
              account: session.accountId,
              mailbox: session.mailboxPath,
              page: page.length,
              hits: identities.length,
            }),
          )
          yield* events.publish({ _tag: "data-changed" })
        },
        Effect.provideService(Database, database),
      )

      const runPage = (account: AccountConfig, state: QueryState, session: RemoteSession) =>
        storeRemotePage(account, state, session).pipe(
          Effect.matchEffect({
            onFailure: (error) => {
              session.done = true
              return Effect.logWarning("remote search page failed").pipe(
                Effect.annotateLogs({
                  account: session.accountId,
                  mailbox: session.mailboxPath,
                  reason: describeError(error),
                }),
              )
            },
            onSuccess: () => Effect.void,
          }),
          Effect.ensuring(
            Effect.sync(() => {
              session.fetching = false
            }),
          ),
        )

      const start = Effect.fn("Search.start")(
        function* startSearch(request: SearchRequest) {
          const normalized = normalizeQuery(request.query)
          const terms = queryTerms(request.query).slice(0, remoteTermLimit)
          if (normalized.length < 2 || terms.length === 0) {
            return
          }
          const state = yield* ensureState(normalized)
          const mailboxes = yield* listSearchMailboxes(request.scope)
          const config = yield* readConfig
          const accounts = new Map(config.accounts.map((account) => [account.id, account]))
          for (const mailbox of mailboxes) {
            const key = `${mailbox.accountId}\u0000${mailbox.id}`
            const existing = state.sessions.get(key)
            const session = existing ?? {
              accountId: mailbox.accountId,
              mailboxId: mailbox.id,
              mailboxPath: mailbox.path,
              terms,
              unseenOnly: request.scope.kind === "unread",
              uids: undefined,
              cursor: 0,
              fetching: false,
              done: false,
            }
            if (existing === undefined) {
              state.sessions.set(key, session)
            }
            const account = accounts.get(mailbox.accountId)
            if (account === undefined || session.fetching || session.done) {
              continue
            }
            session.fetching = true
            yield* Effect.forkIn(runPage(account, state, session), layerScope)
          }
        },
        Effect.provideService(Database, database),
      )

      const messages = Effect.fn("Search.messages")(
        function* searchMessages(request: SearchRequest, limit: number) {
          const normalized = normalizeQuery(request.query)
          const state = (yield* Ref.get(states)).get(normalized)
          const scored = yield* matchRows(request.scope, request.query, state?.hits ?? new Set())
          const sessions = state === undefined ? [] : [...state.sessions.values()]
          const remotePending = normalized.length >= 2 && sessions.some((session) => !session.done)
          return {
            messages: scored.slice(0, limit).map((entry) => toListItem(entry.row)),
            hasMore: scored.length > limit || remotePending,
          }
        },
        Effect.provideService(Database, database),
      )

      const marks = Effect.fn("Search.marks")(
        function* searchMarks(request: SearchRequest) {
          const normalized = normalizeQuery(request.query)
          const state = (yield* Ref.get(states)).get(normalized)
          const scored = yield* matchRows(request.scope, request.query, state?.hits ?? new Set())
          return yield* listMessageTargets(scored.map((entry) => entry.row.id))
        },
        Effect.provideService(Database, database),
      )

      return Search.of({
        marks,
        messages,
        start,
      })
    }),
  )
}

export { Search, type SearchError, type SearchRequest, type SearchShape }
