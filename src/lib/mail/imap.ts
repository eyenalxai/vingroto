import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { ImapFlow } from "imapflow"

import type { AccountConfig } from "@/lib/config/schema"
import type {
  ImapServiceError,
  MailboxInfo,
  MailboxWindowRequest,
  MailboxWindowResult,
  MessageSourceRequest,
  MessageSourceResult,
} from "@/lib/mail/imap-types"

import { Credential } from "@/lib/credential/service"
import { commandTimeout, connectTimeout, guard, releaseClient } from "@/lib/mail/imap-command"
import { fetchMailboxResult } from "@/lib/mail/imap-mailbox"
import { toMailboxInfos } from "@/lib/mail/imap-mapping"
import {
  groupRequestsByMailbox,
  readMailboxSources,
  readMessageSource,
} from "@/lib/mail/imap-message"

interface ImapShape {
  readonly listMailboxes: (
    account: AccountConfig,
  ) => Effect.Effect<readonly MailboxInfo[], ImapServiceError>
  readonly fetchMailboxWindows: (
    account: AccountConfig,
    requests: readonly MailboxWindowRequest[],
  ) => Effect.Effect<readonly MailboxWindowResult[], ImapServiceError>
  readonly fetchMessageSource: (
    account: AccountConfig,
    mailboxPath: string,
    uid: number,
  ) => Effect.Effect<Buffer, ImapServiceError>
  readonly fetchMessageSources: (
    account: AccountConfig,
    requests: readonly MessageSourceRequest[],
  ) => Effect.Effect<readonly MessageSourceResult[], ImapServiceError>
}

class Imap extends Context.Service<Imap, ImapShape>()("vingroto/lib/mail/Imap") {
  static readonly layer = Layer.effect(
    Imap,
    Effect.gen(function* makeImap() {
      const credential = yield* Credential

      const connect = Effect.fn("Imap.connect")(function* openConnection(account: AccountConfig) {
        yield* Effect.logDebug("connecting to the IMAP server").pipe(
          Effect.annotateLogs({
            account: account.id,
            host: account.imap.host,
            port: account.imap.port,
          }),
        )
        const username = yield* credential.get(account.username)
        const password = yield* credential.get(account.password)
        const client = new ImapFlow({
          host: account.imap.host,
          port: account.imap.port,
          secure: account.imap.security === "tls",
          auth: { user: username, pass: password },
          logger: false,
          disableAutoIdle: true,
        })
        yield* guard(account, "connect", connectTimeout, async () => client.connect())
        return client
      })

      const withClient = <A, E, R>(
        account: AccountConfig,
        use: (client: ImapFlow) => Effect.Effect<A, E, R>,
      ) =>
        Effect.scoped(
          Effect.acquireRelease(connect(account), (client) => releaseClient(account, client)).pipe(
            Effect.flatMap((client) => use(client)),
          ),
        )

      return Imap.of({
        listMailboxes: (account) =>
          withClient(account, (client) =>
            guard(account, "list mailboxes", commandTimeout, async () => client.list()).pipe(
              Effect.map((entries) => toMailboxInfos(entries)),
            ),
          ),
        fetchMailboxWindows: (account, requests) =>
          withClient(account, (client) =>
            Effect.all(
              requests.map((request) => fetchMailboxResult(client, account, request)),
              { concurrency: 1 },
            ),
          ),
        fetchMessageSource: (account, mailboxPath, uid) =>
          withClient(account, (client) => readMessageSource(client, account, mailboxPath, uid)),
        fetchMessageSources: (account, requests) => {
          const groups = groupRequestsByMailbox(requests)
          if (groups.length === 0) {
            return Effect.succeed([])
          }
          return withClient(account, (client) =>
            Effect.all(
              groups.map((group) =>
                readMailboxSources(client, account, group.mailboxPath, group.uids),
              ),
              { concurrency: 1 },
            ).pipe(Effect.map((chunks) => chunks.flat())),
          )
        },
      })
    }),
  )
}

export { Imap, type ImapShape }
