import type { ServerConfig } from "@vingroto/core/config/schema"
import type { SrvRecord } from "node:dns"

import { describeError } from "@vingroto/core/errors"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { resolveSrv } from "node:dns/promises"

import type { PartialServers } from "@/lib/mail/autoconfig-types"

const srvLookupTimeout = Duration.seconds(5)

class SrvLookupError extends Schema.TaggedError<SrvLookupError>()("SrvLookupError", {
  name: Schema.String,
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

const srvTarget = (
  record: SrvRecord,
): { readonly host: string; readonly port: number } | undefined => {
  const host = record.name.endsWith(".") ? record.name.slice(0, -1) : record.name
  if (host.length === 0) {
    return undefined
  }
  return { host, port: record.port }
}

const firstTarget = (records: readonly SrvRecord[]) => {
  const sorted = [...records].toSorted((left, right) => left.priority - right.priority)
  return sorted.map((record) => srvTarget(record)).find((target) => target !== undefined)
}

const srvQuery = Effect.fn("Discovery.querySrv")(function* querySrv(
  name: string,
): Effect.fn.Return<readonly SrvRecord[], SrvLookupError> {
  return yield* Effect.tryPromise({
    try: async () => resolveSrv(name),
    catch: (cause: unknown) => new SrvLookupError({ name, message: describeError(cause), cause }),
  }).pipe(
    Effect.timeout(srvLookupTimeout),
    Effect.catchTag("TimeoutError", () =>
      Effect.fail(
        new SrvLookupError({
          name,
          message: `DNS SRV lookup for ${name} timed out after ${Duration.toSeconds(srvLookupTimeout)}s`,
        }),
      ),
    ),
  )
})

const srvServers = Effect.fn("Discovery.srvServers")(function* detectSrv(
  domain: string,
  attempts: string[],
): Effect.fn.Return<PartialServers> {
  const query = (name: string) =>
    srvQuery(name).pipe(
      Effect.catchTag("SrvLookupError", (error) => {
        attempts.push(`${error.name}: ${error.message}`)
        return Effect.succeed<readonly SrvRecord[]>([])
      }),
    )
  const imaps = firstTarget(yield* query(`_imaps._tcp.${domain}`))
  const imap: ServerConfig | undefined =
    imaps === undefined ? undefined : { host: imaps.host, port: imaps.port, security: "tls" }
  const plainImap =
    imap === undefined ? firstTarget(yield* query(`_imap._tcp.${domain}`)) : undefined
  const resolvedImap: ServerConfig | undefined =
    imap ??
    (plainImap === undefined
      ? undefined
      : { host: plainImap.host, port: plainImap.port, security: "starttls" })
  const submissions = firstTarget(yield* query(`_submissions._tcp.${domain}`))
  const smtp: ServerConfig | undefined =
    submissions === undefined
      ? undefined
      : { host: submissions.host, port: submissions.port, security: "tls" }
  const plainSmtp =
    smtp === undefined ? firstTarget(yield* query(`_submission._tcp.${domain}`)) : undefined
  const resolvedSmtp: ServerConfig | undefined =
    smtp ??
    (plainSmtp === undefined
      ? undefined
      : { host: plainSmtp.host, port: plainSmtp.port, security: "starttls" })
  return {
    ...(resolvedImap === undefined ? {} : { imap: resolvedImap }),
    ...(resolvedSmtp === undefined ? {} : { smtp: resolvedSmtp }),
  }
})

export { SrvLookupError, srvServers }
