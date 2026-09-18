import type { ServerConfig } from "@vingroto/core/config/schema"
import type { SrvRecord } from "node:dns"

import { describeError } from "@vingroto/core/errors"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { resolveSrv } from "node:dns/promises"

import type { PartialServers } from "@/lib/mail/autoconfig-types"

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

const srvQuery = (name: string, attempts: string[]): Effect.Effect<readonly SrvRecord[]> =>
  Effect.gen(function* querySrv() {
    const exit = yield* Effect.exit(
      Effect.tryPromise({
        try: async () => resolveSrv(name),
        catch: (error) => error,
      }),
    )
    if (Exit.isSuccess(exit)) {
      return exit.value
    }
    attempts.push(`${name}: ${describeError(Cause.squash(exit.cause))}`)
    return [] as readonly SrvRecord[]
  })

const srvServers = (domain: string, attempts: string[]): Effect.Effect<PartialServers> =>
  Effect.gen(function* detectSrv() {
    const imaps = firstTarget(yield* srvQuery(`_imaps._tcp.${domain}`, attempts))
    const imap: ServerConfig | undefined =
      imaps === undefined ? undefined : { host: imaps.host, port: imaps.port, security: "tls" }
    const plainImap =
      imap === undefined
        ? firstTarget(yield* srvQuery(`_imap._tcp.${domain}`, attempts))
        : undefined
    const resolvedImap: ServerConfig | undefined =
      imap ??
      (plainImap === undefined
        ? undefined
        : { host: plainImap.host, port: plainImap.port, security: "starttls" })
    const submissions = firstTarget(yield* srvQuery(`_submissions._tcp.${domain}`, attempts))
    const smtp: ServerConfig | undefined =
      submissions === undefined
        ? undefined
        : { host: submissions.host, port: submissions.port, security: "tls" }
    const plainSmtp =
      smtp === undefined
        ? firstTarget(yield* srvQuery(`_submission._tcp.${domain}`, attempts))
        : undefined
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

export { srvServers }
