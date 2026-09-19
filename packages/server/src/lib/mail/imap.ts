import type { AccountConfig } from "@vingroto/core/config/schema"
import type { Uid } from "@vingroto/core/ids"

import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { ImapFlow } from "imapflow"

import type {
  FlagMode,
  ImapServiceError,
  MailboxInfo,
  MailboxWindowRequest,
  MailboxWindowResult,
  MessageEnvelope,
  MessageSourceRequest,
  MessageSourceResult,
} from "@/lib/mail/imap-types"

import { passwordReference, usernameReference } from "@/lib/credential/refs"
import { Credential } from "@/lib/credential/service"
import { moveMessages, updateFlags } from "@/lib/mail/imap-actions"
import { appendToMailbox } from "@/lib/mail/imap-append"
import { commandTimeout, connectTimeout, guard, releaseClient } from "@/lib/mail/imap-command"
import { fetchMailboxResult } from "@/lib/mail/imap-mailbox"
import { toMailboxInfos } from "@/lib/mail/imap-mapping"
import {
  groupRequestsByMailbox,
  readMailboxSources,
  readMessageSource,
} from "@/lib/mail/imap-message"
import { fetchMailboxEnvelopes, searchMailbox } from "@/lib/mail/imap-search"

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
    uid: Uid,
  ) => Effect.Effect<Buffer, ImapServiceError>
  readonly fetchMessageSources: (
    account: AccountConfig,
    requests: readonly MessageSourceRequest[],
  ) => Effect.Effect<readonly MessageSourceResult[], ImapServiceError>
  readonly setFlags: (
    account: AccountConfig,
    mailboxPath: string,
    uids: readonly Uid[],
    flags: readonly string[],
    mode: FlagMode,
  ) => Effect.Effect<void, ImapServiceError>
  readonly moveMessages: (
    account: AccountConfig,
    sourcePath: string,
    uids: readonly Uid[],
    targetPath: string,
  ) => Effect.Effect<void, ImapServiceError>
  readonly searchMessages: (
    account: AccountConfig,
    mailboxPath: string,
    terms: readonly string[],
    unseenOnly: boolean,
  ) => Effect.Effect<readonly Uid[], ImapServiceError>
  readonly fetchEnvelopes: (
    account: AccountConfig,
    mailboxPath: string,
    uids: readonly Uid[],
  ) => Effect.Effect<readonly MessageEnvelope[], ImapServiceError>
  readonly appendMessage: (
    account: AccountConfig,
    mailboxPath: string,
    source: Buffer,
    flags: readonly string[],
  ) => Effect.Effect<Uid | undefined, ImapServiceError>
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
        const username = yield* credential.get(usernameReference(account.id))
        const password = yield* credential.get(passwordReference(account.id))
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
        listMailboxes: Effect.fn("Imap.listMailboxes")(function* listMailboxes(
          account: AccountConfig,
        ) {
          return yield* withClient(account, (client) =>
            guard(account, "list mailboxes", commandTimeout, async () => client.list()).pipe(
              Effect.map((entries) => toMailboxInfos(entries)),
            ),
          )
        }),
        fetchMailboxWindows: Effect.fn("Imap.fetchMailboxWindows")(function* fetchMailboxWindows(
          account: AccountConfig,
          requests: readonly MailboxWindowRequest[],
        ) {
          return yield* withClient(account, (client) =>
            Effect.all(
              requests.map((request) => fetchMailboxResult(client, account, request)),
              { concurrency: 1 },
            ),
          )
        }),
        fetchMessageSource: Effect.fn("Imap.fetchMessageSource")(function* fetchMessageSource(
          account: AccountConfig,
          mailboxPath: string,
          uid: Uid,
        ) {
          return yield* withClient(account, (client) =>
            readMessageSource(client, account, mailboxPath, uid),
          )
        }),
        fetchMessageSources: Effect.fn("Imap.fetchMessageSources")(function* fetchMessageSources(
          account: AccountConfig,
          requests: readonly MessageSourceRequest[],
        ) {
          const groups = groupRequestsByMailbox(requests)
          if (groups.length === 0) {
            return []
          }
          return yield* withClient(account, (client) =>
            Effect.all(
              groups.map((group) =>
                readMailboxSources(client, account, group.mailboxPath, group.uids),
              ),
              { concurrency: 1 },
            ).pipe(Effect.map((chunks) => chunks.flat())),
          )
        }),
        setFlags: Effect.fn("Imap.setFlags")(function* setFlags(
          account: AccountConfig,
          mailboxPath: string,
          uids: readonly Uid[],
          flags: readonly string[],
          mode: FlagMode,
        ) {
          return yield* withClient(account, (client) =>
            updateFlags(client, account, mailboxPath, uids, flags, mode),
          )
        }),
        moveMessages: Effect.fn("Imap.moveMessages")(function* moveMessagesForAccount(
          account: AccountConfig,
          sourcePath: string,
          uids: readonly Uid[],
          targetPath: string,
        ) {
          return yield* withClient(account, (client) =>
            moveMessages(client, account, sourcePath, uids, targetPath),
          )
        }),
        searchMessages: Effect.fn("Imap.searchMessages")(function* searchMessagesForAccount(
          account: AccountConfig,
          mailboxPath: string,
          terms: readonly string[],
          unseenOnly: boolean,
        ) {
          return yield* withClient(account, (client) =>
            searchMailbox(client, account, mailboxPath, terms, unseenOnly),
          )
        }),
        fetchEnvelopes: Effect.fn("Imap.fetchEnvelopes")(function* fetchEnvelopesForAccount(
          account: AccountConfig,
          mailboxPath: string,
          uids: readonly Uid[],
        ) {
          return yield* withClient(account, (client) =>
            fetchMailboxEnvelopes(client, account, mailboxPath, uids),
          )
        }),
        appendMessage: Effect.fn("Imap.appendMessage")(function* appendMessageForAccount(
          account: AccountConfig,
          mailboxPath: string,
          source: Buffer,
          flags: readonly string[],
        ) {
          return yield* withClient(account, (client) =>
            appendToMailbox(client, account, mailboxPath, source, flags),
          )
        }),
      })
    }),
  )
}

export { Imap, type ImapShape }
