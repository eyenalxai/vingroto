import type { SrvRecord } from "node:dns"

import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { resolveSrv } from "node:dns/promises"

import type { PartialServers } from "@/lib/mail/autoconfig-types"

import { ServerConfig } from "@/lib/config/schema"
import { describeError } from "@/lib/errors"

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
    const imap =
      imaps === undefined
        ? undefined
        : new ServerConfig({ host: imaps.host, port: imaps.port, security: "tls" })
    const plainImap =
      imap === undefined
        ? firstTarget(yield* srvQuery(`_imap._tcp.${domain}`, attempts))
        : undefined
    const resolvedImap =
      imap ??
      (plainImap === undefined
        ? undefined
        : new ServerConfig({ host: plainImap.host, port: plainImap.port, security: "starttls" }))
    const submissions = firstTarget(yield* srvQuery(`_submissions._tcp.${domain}`, attempts))
    const smtp =
      submissions === undefined
        ? undefined
        : new ServerConfig({ host: submissions.host, port: submissions.port, security: "tls" })
    const plainSmtp =
      smtp === undefined
        ? firstTarget(yield* srvQuery(`_submission._tcp.${domain}`, attempts))
        : undefined
    const resolvedSmtp =
      smtp ??
      (plainSmtp === undefined
        ? undefined
        : new ServerConfig({ host: plainSmtp.host, port: plainSmtp.port, security: "starttls" }))
    return { imap: resolvedImap, smtp: resolvedSmtp }
  })

export { srvServers }
