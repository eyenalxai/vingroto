import type { AccountConfig } from "@vingroto/core/config/schema"
import type { Uid } from "@vingroto/core/ids"
import type { AuthOptions } from "imapflow"

import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as Stream from "effect/Stream"
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
import { imapAuthFor } from "@/lib/mail/auth"
import { moveMessages, updateFlags } from "@/lib/mail/imap-actions"
import { appendToMailbox } from "@/lib/mail/imap-append"
import {
  commandTimeout,
  connectTimeout,
  forceCloseClient,
  guard,
  guardRead,
  releaseClient,
} from "@/lib/mail/imap-command"
import { fetchMailboxResult } from "@/lib/mail/imap-mailbox"
import { toMailboxInfos } from "@/lib/mail/imap-mapping"
import {
  groupRequestsByMailbox,
  readMailboxSources,
  readMessageSource,
} from "@/lib/mail/imap-message"
import { fetchMailboxEnvelopes, searchMailbox } from "@/lib/mail/imap-search"
import { GoogleOAuth } from "@/lib/oauth/service"

const connectRetrySchedule = Schedule.exponential("500 millis").pipe(
  Schedule.jittered,
  Schedule.upTo({ times: 2 }),
)

interface ImapShape {
  readonly listMailboxes: (
    account: AccountConfig,
  ) => Effect.Effect<readonly MailboxInfo[], ImapServiceError>
  readonly fetchMailboxWindows: (
    account: AccountConfig,
    requests: readonly MailboxWindowRequest[],
  ) => Stream.Stream<MailboxWindowResult, ImapServiceError>
  readonly fetchMessageSource: (
    account: AccountConfig,
    mailboxPath: string,
    uid: Uid,
  ) => Effect.Effect<Buffer, ImapServiceError>
  readonly fetchMessageSources: (
    account: AccountConfig,
    requests: readonly MessageSourceRequest[],
  ) => Stream.Stream<MessageSourceResult, ImapServiceError>
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

// A failed or abandoned connect leaves the socket in an unknown state.
// Each attempt gets a fresh client and the previous one is closed before retrying.
const connectOnce = (account: AccountConfig, auth: AuthOptions) =>
  Effect.suspend(() => {
    const client = new ImapFlow({
      host: account.imap.host,
      port: account.imap.port,
      secure: account.imap.security === "tls",
      auth,
      logger: false,
      disableAutoIdle: true,
    })
    return guard(account, "connect", connectTimeout, () => client.connect()).pipe(
      Effect.onExit((exit) =>
        Exit.isSuccess(exit) ? Effect.void : forceCloseClient(account, client),
      ),
      Effect.as(client),
    )
  })

class Imap extends Context.Service<Imap, ImapShape>()("@vingroto/server/lib/mail/imap") {
  static readonly layer = Layer.effect(
    Imap,
    Effect.gen(function* makeImap() {
      const credential = yield* Credential
      const oauth = yield* GoogleOAuth

      const connect = Effect.fn("Imap.connect")(function* openConnection(account: AccountConfig) {
        yield* Effect.logDebug("connecting to the IMAP server").pipe(
          Effect.annotateLogs({
            account: account.id,
            host: account.imap.host,
            port: account.imap.port,
          }),
        )
        const username = yield* credential.get(usernameReference(account.id))
        const secret =
          account.auth === "oauth2"
            ? yield* oauth.accessToken(account)
            : yield* credential.get(passwordReference(account.id))
        return yield* connectOnce(account, imapAuthFor(account, username, secret)).pipe(
          Effect.retry(connectRetrySchedule),
        )
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

      // The client scope spans the whole stream.
      // An early stop or an interrupted consumer still runs the release finalizer.
      const withClientStream = <A, E, R>(
        account: AccountConfig,
        use: (client: ImapFlow) => Stream.Stream<A, E, R>,
      ): Stream.Stream<A, E | ImapServiceError, R> =>
        Stream.scoped(
          Stream.fromEffect(
            Effect.acquireRelease(connect(account), (client) => releaseClient(account, client)),
          ),
        ).pipe(Stream.flatMap((client) => use(client)))

      return Imap.of({
        listMailboxes: Effect.fn("Imap.listMailboxes")(function* listMailboxes(
          account: AccountConfig,
        ) {
          return yield* withClient(account, (client) =>
            guardRead(account, "list mailboxes", commandTimeout, () => client.list()).pipe(
              Effect.map((entries) => toMailboxInfos(entries)),
            ),
          )
        }),
        fetchMailboxWindows: (account, requests) => {
          if (requests.length === 0) {
            return Stream.empty
          }
          return withClientStream(account, (client) =>
            Stream.fromIterable(requests).pipe(
              Stream.mapEffect((request) => fetchMailboxResult(client, account, request), {
                concurrency: 1,
              }),
            ),
          ).pipe(Stream.withSpan("Imap.fetchMailboxWindows"))
        },
        fetchMessageSource: Effect.fn("Imap.fetchMessageSource")(function* fetchMessageSource(
          account: AccountConfig,
          mailboxPath: string,
          uid: Uid,
        ) {
          return yield* withClient(account, (client) =>
            readMessageSource(client, account, mailboxPath, uid),
          )
        }),
        fetchMessageSources: (account, requests) => {
          const groups = groupRequestsByMailbox(requests)
          if (groups.length === 0) {
            return Stream.empty
          }
          return withClientStream(account, (client) =>
            Stream.fromIterable(groups).pipe(
              Stream.flatMap((group) =>
                readMailboxSources(client, account, group.mailboxPath, group.uids),
              ),
            ),
          ).pipe(Stream.withSpan("Imap.fetchMessageSources"))
        },
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
