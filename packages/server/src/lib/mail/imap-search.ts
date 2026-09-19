import type { AccountConfig } from "@vingroto/core/config/schema"
import type { ImapFlow } from "imapflow"

import { Uid } from "@vingroto/core/ids"
import * as Effect from "effect/Effect"

import type { ImapError, MessageEnvelope } from "@/lib/mail/imap-types"

import { commandTimeout, guard, withMailboxLock } from "@/lib/mail/imap-command"
import { fetchEnvelopes } from "@/lib/mail/imap-mailbox"

const searchMailbox = Effect.fn("Imap.searchMailbox")(function* searchMailboxUids(
  client: ImapFlow,
  account: AccountConfig,
  mailboxPath: string,
  terms: readonly string[],
  unseenOnly: boolean,
): Effect.fn.Return<readonly Uid[], ImapError> {
  if (terms.length === 0) {
    return []
  }
  return yield* withMailboxLock(
    client,
    account,
    mailboxPath,
    true,
    Effect.gen(function* searchInsideMailbox() {
      const found = yield* Effect.all(
        terms.map((term) =>
          guard(account, `search ${mailboxPath}`, commandTimeout, async () =>
            client.search(
              {
                text: term,
                deleted: false,
                ...(unseenOnly ? { seen: false } : {}),
              },
              { uid: true },
            ),
          ),
        ),
        { concurrency: 1 },
      )
      const sets = found.map((uids) => new Set(uids === false || uids === undefined ? [] : uids))
      const [head, ...tail] = sets
      if (head === undefined || sets.some((set) => set.size === 0)) {
        return []
      }
      let matched = head
      for (const next of tail) {
        matched = new Set([...matched].filter((uid) => next.has(uid)))
      }
      return [...matched].toSorted((left, right) => right - left).map((uid) => Uid.make(uid))
    }),
  )
})

const fetchMailboxEnvelopes = Effect.fn("Imap.fetchMailboxEnvelopes")(
  function* fetchEnvelopesForMailbox(
    client: ImapFlow,
    account: AccountConfig,
    mailboxPath: string,
    uids: readonly Uid[],
  ): Effect.fn.Return<readonly MessageEnvelope[], ImapError> {
    if (uids.length === 0) {
      return []
    }
    return yield* withMailboxLock(
      client,
      account,
      mailboxPath,
      true,
      fetchEnvelopes(client, account, uids),
    )
  },
)

export { fetchMailboxEnvelopes, searchMailbox }
