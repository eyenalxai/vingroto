import type { AccountConfig } from "@vingroto/core/config/schema"
import type { ListScope, MessageTarget, SearchOutcome } from "@vingroto/core/protocol/mail"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"

import { AppPaths } from "@vingroto/core/app-paths"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"

import type { ConfigInvalid, ConfigUnreadable } from "@/lib/config/load"
import type { ImapServiceError } from "@/lib/mail/imap-types"
import type {
  MailboxRef,
  PageClaim,
  PagePlan,
  QueryEntry,
  RemoteSession,
} from "@/lib/mail/search-state"

import { loadConfigFile } from "@/lib/config/load"
import { Database } from "@/lib/db/database"
import { ServerEvents } from "@/lib/events"
import { Imap } from "@/lib/mail/imap"
import { matchRows, queryTerms, toListItem } from "@/lib/mail/search-match"
import { makePageRunner } from "@/lib/mail/search-pages"
import { makeEnsureState, sessionKey } from "@/lib/mail/search-state"
import { listMessageTargets, listSearchMailboxes } from "@/lib/store/message-search"

interface SearchRequest {
  readonly scope: ListScope
  readonly query: string
}

type SearchError = ConfigInvalid | ConfigUnreadable | ImapServiceError | EffectDrizzleQueryError

interface SearchShape {
  readonly messages: (
    request: SearchRequest,
    limit: number,
  ) => Effect.Effect<SearchOutcome, SearchError>
  readonly marks: (request: SearchRequest) => Effect.Effect<readonly MessageTarget[], SearchError>
  readonly start: (request: SearchRequest) => Effect.Effect<void, SearchError>
}

const remoteTermLimit = 5
const rememberedQueryLimit = 20
const queryLifetimeMillis = 30 * 60 * 1000

const normalizeQuery = (query: string) => query.trim().replaceAll(/\s+/gu, " ").toLowerCase()

const claimPages = (
  map: ReadonlyMap<string, QueryEntry>,
  normalized: string,
  entryId: number,
  mailboxes: readonly MailboxRef[],
  terms: readonly string[],
  unseenOnly: boolean,
  plans: ReadonlyMap<string, PagePlan>,
): readonly [readonly PageClaim[], ReadonlyMap<string, QueryEntry>] => {
  const current = map.get(normalized)
  if (current === undefined || current.id !== entryId) {
    return [[], map]
  }
  const sessions = new Map(current.sessions)
  const pages: PageClaim[] = []
  for (const mailbox of mailboxes) {
    const key = sessionKey(mailbox.accountId, mailbox.id)
    const session = sessions.get(key) ?? {
      accountId: mailbox.accountId,
      mailboxId: mailbox.id,
      mailboxPath: mailbox.path,
      terms,
      unseenOnly,
      uids: undefined,
      cursor: 0,
      fetching: undefined,
      done: false,
    }
    const plan = plans.get(key)
    if (plan === undefined || session.fetching !== undefined || session.done) {
      sessions.set(key, session)
      continue
    }
    const claimed: RemoteSession = { ...session, fetching: plan.token }
    sessions.set(key, claimed)
    pages.push({ account: plan.account, key, session: claimed, token: plan.token })
  }
  const replaced: readonly [string, QueryEntry] = [normalized, { ...current, sessions }]
  return [pages, new Map([...map, replaced])]
}

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
      const states = yield* Ref.make<ReadonlyMap<string, QueryEntry>>(new Map())
      const entryIds = yield* Ref.make(0)
      const pageTokens = yield* Ref.make(0)
      const readConfig = loadConfigFile(paths.config, fs)
      const ensureState = makeEnsureState({ entryIds, layerScope, states })
      const runPage = makePageRunner({ database, events, imap, states })

      const start = Effect.fn("Search.start")(
        function* startSearch(request: SearchRequest) {
          const normalized = normalizeQuery(request.query)
          const terms = queryTerms(request.query).slice(0, remoteTermLimit)
          if (normalized.length < 2 || terms.length === 0) {
            return
          }
          const entry = yield* ensureState(normalized, queryLifetimeMillis, rememberedQueryLimit)
          const mailboxes = yield* listSearchMailboxes(request.scope)
          const config = yield* readConfig
          const accounts = new Map(config.accounts.map((account) => [account.id, account]))
          const plans = new Map<string, { account: AccountConfig; token: number }>()
          for (const mailbox of mailboxes) {
            const account = accounts.get(mailbox.accountId)
            if (account === undefined) {
              continue
            }
            const key = sessionKey(mailbox.accountId, mailbox.id)
            const token = yield* Ref.updateAndGet(pageTokens, (current) => current + 1)
            plans.set(key, { account, token })
          }
          const pages = yield* Ref.modify(states, (map) =>
            claimPages(
              map,
              normalized,
              entry.id,
              mailboxes,
              terms,
              request.scope.kind === "unread",
              plans,
            ),
          )
          for (const page of pages) {
            yield* Effect.forkIn(runPage(normalized, entry.id, page), entry.scope)
          }
        },
        Effect.provideService(Database, database),
      )

      const messages = Effect.fn("Search.messages")(
        function* searchMessages(request: SearchRequest, limit: number) {
          const normalized = normalizeQuery(request.query)
          const entry = (yield* Ref.get(states)).get(normalized)
          const scored = yield* matchRows(request.scope, request.query, entry?.hits ?? new Set())
          const sessions = entry === undefined ? [] : [...entry.sessions.values()]
          const remotePending = normalized.length >= 2 && sessions.some((session) => !session.done)
          return {
            messages: scored.slice(0, limit).map((scoredRow) => toListItem(scoredRow.row)),
            hasMore: scored.length > limit || remotePending,
          }
        },
        Effect.provideService(Database, database),
      )

      const marks = Effect.fn("Search.marks")(
        function* searchMarks(request: SearchRequest) {
          const normalized = normalizeQuery(request.query)
          const entry = (yield* Ref.get(states)).get(normalized)
          const scored = yield* matchRows(request.scope, request.query, entry?.hits ?? new Set())
          return yield* listMessageTargets(scored.map((scoredRow) => scoredRow.row.id))
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
