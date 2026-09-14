import type { FetchMessageObject, FetchQueryObject } from "imapflow"

import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { ImapFlow } from "imapflow"

import type { AccountConfig } from "@/lib/config/schema"
import type {
  ImapServiceError,
  MailboxInfo,
  MailboxSnapshot,
  MailboxWindowRequest,
  MailboxWindowResult,
  MessageEnvelope,
} from "@/lib/mail/imap-types"

import { Credential } from "@/lib/credential/service"
import { describeError } from "@/lib/errors"
import { toMailboxInfos, toMessageEnvelope } from "@/lib/mail/imap-mapping"
import { ImapError } from "@/lib/mail/imap-types"

const connectTimeout = Duration.seconds(30)
const commandTimeout = Duration.minutes(2)
const logoutTimeout = Duration.seconds(10)
const fetchBatchSize = 200
const maxSourceBytes = 32 * 1024 * 1024

const envelopeQuery: FetchQueryObject = {
  uid: true,
  envelope: true,
  flags: true,
  size: true,
  internalDate: true,
}

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
}

const toImapError = (account: AccountConfig, operation: string, cause: unknown) =>
  new ImapError({ accountId: account.id, operation, message: describeError(cause) })

const timedOut = (account: AccountConfig, operation: string, timeout: Duration.Duration) =>
  new ImapError({
    accountId: account.id,
    operation,
    message: `${operation} timed out after ${Duration.toSeconds(timeout)}s`,
  })

const guard = <A>(
  account: AccountConfig,
  operation: string,
  timeout: Duration.Duration,
  run: () => Promise<A>,
) =>
  Effect.tryPromise({
    try: run,
    catch: (cause: unknown) => toImapError(account, operation, cause),
  }).pipe(
    Effect.timeout(timeout),
    Effect.catchTag("TimeoutError", () => Effect.fail(timedOut(account, operation, timeout))),
  )

const collectUids = (
  client: ImapFlow,
  account: AccountConfig,
  request: MailboxWindowRequest,
  uidNext: number,
) =>
  Effect.gen(function* collectMailboxUids() {
    const fromUid = request.fromUid
    if (fromUid !== undefined) {
      if (fromUid >= uidNext) {
        return []
      }
      const found = yield* guard(account, `search ${request.path}`, commandTimeout, async () =>
        client.search({ uid: `${fromUid}:*` }, { uid: true }),
      )
      const uids = found === false || found === undefined ? [] : found
      return uids.filter((uid) => uid >= fromUid)
    }
    const since = request.since
    if (since === undefined) {
      return []
    }
    const found = yield* guard(account, `search ${request.path}`, commandTimeout, async () =>
      client.search({ since }, { uid: true }),
    )
    return found === false || found === undefined ? [] : found
  })

const fetchEnvelopes = (client: ImapFlow, account: AccountConfig, uids: readonly number[]) =>
  Effect.gen(function* fetchMessageEnvelopes() {
    const messages: MessageEnvelope[] = []
    for (let index = 0; index < uids.length; index += fetchBatchSize) {
      const batch = uids.slice(index, index + fetchBatchSize)
      const fetched = yield* guard(account, "fetch envelopes", commandTimeout, async () => {
        const collected: FetchMessageObject[] = []
        for await (const message of client.fetch(batch, envelopeQuery, { uid: true })) {
          collected.push(message)
        }
        return collected
      })
      for (const message of fetched) {
        messages.push(toMessageEnvelope(message))
      }
    }
    return messages
  })

const fetchMailbox = (client: ImapFlow, account: AccountConfig, request: MailboxWindowRequest) =>
  Effect.gen(function* openMailboxWindow() {
    const lock = yield* guard(account, `select ${request.path}`, commandTimeout, async () =>
      client.getMailboxLock(request.path),
    )
    const contents = Effect.gen(function* readMailboxContents() {
      const mailbox = client.mailbox
      if (mailbox === false) {
        return yield* new ImapError({
          accountId: account.id,
          operation: `select ${request.path}`,
          message: "the mailbox could not be opened",
        })
      }
      const uids = yield* collectUids(client, account, request, mailbox.uidNext)
      const messages = yield* fetchEnvelopes(client, account, uids)
      const snapshot: MailboxSnapshot = {
        path: request.path,
        uidValidity: Number(mailbox.uidValidity),
        exists: mailbox.exists,
        messages,
      }
      return snapshot
    })
    const release = Effect.sync(() => {
      lock.release()
    })
    return yield* contents.pipe(Effect.ensuring(release))
  })

const fetchMailboxResult = (
  client: ImapFlow,
  account: AccountConfig,
  request: MailboxWindowRequest,
) =>
  Effect.gen(function* resolveMailboxWindow() {
    const outcome = yield* fetchMailbox(client, account, request).pipe(
      Effect.map((snapshot): MailboxWindowResult => {
        return { _tag: "ok", path: request.path, snapshot }
      }),
      Effect.catch((error) =>
        Effect.succeed<MailboxWindowResult>({
          _tag: "error",
          path: request.path,
          message: error.message,
        }),
      ),
    )
    return outcome
  })

const readMessageSource = (
  client: ImapFlow,
  account: AccountConfig,
  mailboxPath: string,
  uid: number,
) =>
  Effect.gen(function* readSource() {
    const lock = yield* guard(account, `select ${mailboxPath}`, commandTimeout, async () =>
      client.getMailboxLock(mailboxPath, { readOnly: true }),
    )
    const contents = Effect.gen(function* fetchSource() {
      const message = yield* guard(account, `fetch message ${uid}`, commandTimeout, async () =>
        client.fetchOne(uid, { source: true }, { uid: true }),
      )
      if (message === false || message === undefined || message.source === undefined) {
        return yield* new ImapError({
          accountId: account.id,
          operation: `fetch message ${uid}`,
          message: `message ${uid} could not be read from ${mailboxPath}`,
        })
      }
      if (message.source.length > maxSourceBytes) {
        const limit = Math.round(maxSourceBytes / (1024 * 1024))
        return yield* new ImapError({
          accountId: account.id,
          operation: `fetch message ${uid}`,
          message: `message ${uid} is larger than ${limit} MB`,
        })
      }
      return message.source
    })
    const release = Effect.sync(() => {
      lock.release()
    })
    return yield* contents.pipe(Effect.ensuring(release))
  })

const releaseClient = (account: AccountConfig, client: ImapFlow) =>
  Effect.gen(function* releaseConnection() {
    yield* guard(account, "logout", logoutTimeout, async () => client.logout()).pipe(
      Effect.catch((error) =>
        Effect.logWarning(`IMAP logout failed for ${account.id}: ${error.message}`),
      ),
    )
  })

class Imap extends Context.Service<Imap, ImapShape>()("vingroto/lib/mail/Imap") {
  static readonly layer = Layer.effect(
    Imap,
    Effect.gen(function* makeImap() {
      const credential = yield* Credential

      const connect = Effect.fn("Imap.connect")(function* openConnection(account: AccountConfig) {
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
      })
    }),
  )
}

export { Imap, type ImapShape }
