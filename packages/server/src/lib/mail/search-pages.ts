import type * as Ref from "effect/Ref"

import { describeError } from "@vingroto/core/errors"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"

import type { DatabaseShape } from "@/lib/db/database"
import type { ServerEventsShape } from "@/lib/events"
import type { ImapShape } from "@/lib/mail/imap"
import type { PageClaim, QueryEntry } from "@/lib/mail/search-state"

import { Database } from "@/lib/db/database"
import { clearFetching, failSession, finishSession } from "@/lib/mail/search-state"
import { messageIdentitiesForUids } from "@/lib/store/message-search"
import { storeMessages } from "@/lib/store/messages"

interface PageRunnerOptions {
  readonly database: DatabaseShape
  readonly events: ServerEventsShape
  readonly imap: ImapShape
  readonly states: Ref.Ref<ReadonlyMap<string, QueryEntry>>
}

const remotePageSize = 100

const makePageRunner = (options: PageRunnerOptions) => {
  const storeRemotePage = Effect.fn("Search.storeRemotePage")(
    function* storePage(normalized: string, entryId: number, claim: PageClaim) {
      const { session, token } = claim
      const uids =
        session.uids ??
        (yield* options.imap.searchMessages(
          claim.account,
          session.mailboxPath,
          session.terms,
          session.unseenOnly,
        ))
      const page = uids.slice(session.cursor, session.cursor + remotePageSize)
      if (page.length === 0) {
        yield* finishSession(
          options.states,
          normalized,
          entryId,
          claim.key,
          token,
          uids,
          session.cursor,
          [],
        )
        return
      }
      const envelopes = yield* options.imap.fetchEnvelopes(claim.account, session.mailboxPath, page)
      yield* storeMessages({
        accountId: session.accountId,
        mailboxId: session.mailboxId,
        envelopes,
      })
      const identities = yield* messageIdentitiesForUids(session.mailboxId, page)
      yield* finishSession(
        options.states,
        normalized,
        entryId,
        claim.key,
        token,
        uids,
        session.cursor + page.length,
        identities,
      )
      yield* Effect.logInfo("remote search page stored").pipe(
        Effect.annotateLogs({
          account: session.accountId,
          mailbox: session.mailboxPath,
          page: page.length,
          hits: identities.length,
        }),
      )
      yield* options.events.publish({ _tag: "data-changed" })
    },
    Effect.provideService(Database, options.database),
  )

  return (normalized: string, entryId: number, claim: PageClaim) =>
    storeRemotePage(normalized, entryId, claim).pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          failSession(options.states, normalized, entryId, claim.key, claim.token).pipe(
            Effect.andThen(
              Effect.logWarning("remote search page failed").pipe(
                Effect.annotateLogs({
                  account: claim.session.accountId,
                  mailbox: claim.session.mailboxPath,
                  reason: describeError(error),
                }),
              ),
            ),
          ),
        onSuccess: () => Effect.void,
      }),
      Effect.onExit((exit) =>
        Exit.isSuccess(exit)
          ? Effect.void
          : clearFetching(options.states, normalized, entryId, claim.key, claim.token),
      ),
    )
}

export { makePageRunner, type PageRunnerOptions }
