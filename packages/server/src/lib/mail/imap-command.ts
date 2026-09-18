import type { AccountConfig } from "@vingroto/core/config/schema"
import type { ImapFlow } from "imapflow"

import { describeError } from "@vingroto/core/errors"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"

import { ImapError } from "@/lib/mail/imap-types"

const connectTimeout = Duration.seconds(30)
const commandTimeout = Duration.minutes(2)
const logoutTimeout = Duration.seconds(10)

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

const withMailboxLock = <A, E, R>(
  client: ImapFlow,
  account: AccountConfig,
  mailboxPath: string,
  readOnly: boolean,
  use: Effect.Effect<A, E, R>,
) =>
  Effect.acquireUseRelease(
    guard(account, `select ${mailboxPath}`, commandTimeout, async () =>
      client.getMailboxLock(mailboxPath, { readOnly }),
    ),
    () => use,
    (lock) =>
      Effect.sync(() => {
        lock.release()
      }),
  )

const releaseClient = (account: AccountConfig, client: ImapFlow) =>
  Effect.gen(function* releaseConnection() {
    yield* guard(account, "logout", logoutTimeout, async () => client.logout()).pipe(
      Effect.catch((error) =>
        Effect.logWarning(`IMAP logout failed for ${account.id}: ${error.message}`),
      ),
    )
  })

export { commandTimeout, connectTimeout, guard, releaseClient, withMailboxLock }
