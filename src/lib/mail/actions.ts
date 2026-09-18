import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import type { AccountConfig } from "@/lib/config/schema"

import { Database } from "@/lib/db/database"
import { describeError } from "@/lib/errors"
import { Imap } from "@/lib/mail/imap"
import { deleteMessages, setMessagesSeen } from "@/lib/store/messages"

interface MessageActionRequest {
  readonly messageId: number
  readonly mailboxPath: string
  readonly uid: number
}

interface SeenOutcome {
  readonly affected: number
  readonly errors: readonly string[]
}

interface MoveOutcome {
  readonly moved: number
  readonly skipped: number
  readonly errors: readonly string[]
}

interface MailActionsShape {
  readonly setSeen: (
    account: AccountConfig,
    requests: readonly MessageActionRequest[],
    seen: boolean,
  ) => Effect.Effect<SeenOutcome>
  readonly move: (
    account: AccountConfig,
    requests: readonly MessageActionRequest[],
    targetPath: string,
  ) => Effect.Effect<MoveOutcome>
}

interface MailboxGroup {
  readonly mailboxPath: string
  readonly requests: readonly MessageActionRequest[]
}

const seenFlag = String.raw`\Seen`

const groupByMailbox = (requests: readonly MessageActionRequest[]): readonly MailboxGroup[] => {
  const groups = new Map<string, MessageActionRequest[]>()
  for (const request of requests) {
    const bucket = groups.get(request.mailboxPath)
    if (bucket === undefined) {
      groups.set(request.mailboxPath, [request])
      continue
    }
    bucket.push(request)
  }
  return [...groups].map(([mailboxPath, entries]) => {
    return { mailboxPath, requests: entries }
  })
}

class MailActions extends Context.Service<MailActions, MailActionsShape>()(
  "vingroto/lib/mail/MailActions",
) {
  static readonly layer = Layer.effect(
    MailActions,
    Effect.gen(function* makeMailActions() {
      const imap = yield* Imap
      const database = yield* Database

      const setSeen = Effect.fn("MailActions.setSeen")(function* applySeen(
        account: AccountConfig,
        requests: readonly MessageActionRequest[],
        seen: boolean,
      ) {
        const applied: number[] = []
        const errors: string[] = []
        for (const group of groupByMailbox(requests)) {
          yield* imap
            .setFlags(
              account,
              group.mailboxPath,
              group.requests.map((request) => request.uid),
              [seenFlag],
              seen ? "add" : "remove",
            )
            .pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  for (const request of group.requests) {
                    applied.push(request.messageId)
                  }
                }),
              ),
              Effect.catch((error) =>
                Effect.sync(() => {
                  errors.push(`${group.mailboxPath}: ${describeError(error)}`)
                }),
              ),
            )
        }
        yield* setMessagesSeen(applied, seen)
        return { affected: applied.length, errors }
      })

      const move = Effect.fn("MailActions.move")(function* moveToMailbox(
        account: AccountConfig,
        requests: readonly MessageActionRequest[],
        targetPath: string,
      ) {
        const eligible = requests.filter((request) => request.mailboxPath !== targetPath)
        const moved: number[] = []
        const errors: string[] = []
        for (const group of groupByMailbox(eligible)) {
          yield* imap
            .moveMessages(
              account,
              group.mailboxPath,
              group.requests.map((request) => request.uid),
              targetPath,
            )
            .pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  for (const request of group.requests) {
                    moved.push(request.messageId)
                  }
                }),
              ),
              Effect.catch((error) =>
                Effect.sync(() => {
                  errors.push(`${group.mailboxPath}: ${describeError(error)}`)
                }),
              ),
            )
        }
        yield* deleteMessages(moved)
        return { moved: moved.length, skipped: requests.length - eligible.length, errors }
      })

      const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.provideService(effect, Database, database)

      return MailActions.of({
        setSeen: (account, requests, seen) =>
          Effect.gen(function* runSeenAction() {
            return yield* provide(setSeen(account, requests, seen)).pipe(
              Effect.catch((error) =>
                Effect.succeed({
                  affected: 0,
                  errors: [`could not update the local cache · ${describeError(error)}`],
                }),
              ),
            )
          }),
        move: (account, requests, targetPath) =>
          Effect.gen(function* runMoveAction() {
            return yield* provide(move(account, requests, targetPath)).pipe(
              Effect.catch((error) =>
                Effect.succeed({
                  moved: 0,
                  skipped: 0,
                  errors: [`could not update the local cache · ${describeError(error)}`],
                }),
              ),
            )
          }),
      })
    }),
  )
}

export {
  MailActions,
  type MailActionsShape,
  type MessageActionRequest,
  type MoveOutcome,
  type SeenOutcome,
}
