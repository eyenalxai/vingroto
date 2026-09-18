import { ServerConfig } from "@vingroto/core/config/schema"
import { describeError } from "@vingroto/core/errors"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"

import type { DiscoveryResult, PartialServers } from "@/lib/mail/autoconfig-types"

import { srvServers } from "@/lib/mail/autoconfig-srv"
import { parseAutoconfig } from "@/lib/mail/autoconfig-xml"

const requestTimeout = Duration.seconds(10)

const hasServers = (servers: PartialServers) =>
  servers.imap !== undefined || servers.smtp !== undefined

const emailDomain = (email: string): string | undefined => {
  const at = email.lastIndexOf("@")
  const domain = at <= 0 ? "" : email.slice(at + 1).trim()
  return domain.length === 0 ? undefined : domain
}

const fetchText = (
  url: string,
  attempts: string[],
): Effect.Effect<string | null, never, HttpClient.HttpClient> =>
  Effect.gen(function* requestText() {
    const client = yield* HttpClient.HttpClient
    const exit = yield* Effect.exit(
      Effect.gen(function* fetchDocument() {
        const response = yield* client.get(url)
        if (response.status !== 200) {
          attempts.push(`${url} returned HTTP ${response.status}`)
          return null
        }
        return yield* response.text
      }).pipe(Effect.timeout(requestTimeout)),
    )
    if (Exit.isSuccess(exit)) {
      return exit.value
    }
    attempts.push(`${url} failed: ${describeError(Cause.squash(exit.cause))}`)
    return null
  })

const autoconfigServers = (
  email: string,
  domain: string,
  attempts: string[],
): Effect.Effect<PartialServers, never, HttpClient.HttpClient> =>
  Effect.gen(function* detectAutoconfig() {
    const urls = [
      `https://autoconfig.${domain}/mail/config-v1.1.xml`,
      `https://${domain}/.well-known/autoconfig/mail/config-v1.1.xml`,
      `https://autoconfig.thunderbird.net/v1.1/${domain}`,
    ]
    for (const url of urls) {
      const text = yield* fetchText(url, attempts)
      if (text === null) {
        continue
      }
      const parsed = parseAutoconfig(text, email, domain)
      if (parsed === undefined) {
        attempts.push(`${url}: unrecognized provider configuration`)
        continue
      }
      if (parsed.redirect !== undefined) {
        const redirected = yield* fetchText(parsed.redirect, attempts)
        if (redirected !== null) {
          const resolved = parseAutoconfig(redirected, email, domain)
          if (resolved !== undefined && hasServers(resolved.servers)) {
            return resolved.servers
          }
        }
        continue
      }
      if (hasServers(parsed.servers)) {
        return parsed.servers
      }
    }
    return {}
  })

const guessImap = (domain: string) =>
  new ServerConfig({ host: `imap.${domain}`, port: 993, security: "tls" })

const guessSmtp = (domain: string) =>
  new ServerConfig({ host: `smtp.${domain}`, port: 465, security: "tls" })

const describeSource = (xml: PartialServers, srv: PartialServers) => {
  if (xml.imap !== undefined && xml.smtp !== undefined) {
    return "published provider configuration"
  }
  if (srv.imap !== undefined && srv.smtp !== undefined) {
    return "DNS SRV records"
  }
  if (hasServers(xml) || hasServers(srv)) {
    return "partial autodetect with hostname guesses"
  }
  return "hostname guess, verify before saving"
}

const discover = Effect.fn("Autoconfig.discover")(function* discover(email: string) {
  const domain = emailDomain(email)
  const attempts: string[] = []
  if (domain === undefined) {
    return { _tag: "not-found", attempts: ["the email address is missing a domain"] } as const
  }
  const fromXml = yield* autoconfigServers(email, domain, attempts)
  const fromSrv = hasServers(fromXml) ? {} : yield* srvServers(domain, attempts)
  const imap = fromXml.imap ?? fromSrv.imap ?? guessImap(domain)
  const smtp = fromXml.smtp ?? fromSrv.smtp ?? guessSmtp(domain)
  return {
    _tag: "found",
    servers: {
      imap,
      smtp,
      username: fromXml.username,
      source: describeSource(fromXml, fromSrv),
    },
  } as const
})

interface DiscoveryShape {
  readonly discover: (email: string) => Effect.Effect<DiscoveryResult>
}

class Discovery extends Context.Service<Discovery, DiscoveryShape>()(
  "vingroto/lib/mail/Discovery",
) {
  static readonly layer = Layer.effect(
    Discovery,
    Effect.gen(function* makeDiscovery() {
      const client = yield* HttpClient.HttpClient
      return Discovery.of({
        discover: (email: string) =>
          discover(email).pipe(Effect.provideService(HttpClient.HttpClient, client)),
      })
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer))
}

export { Discovery, type DiscoveryShape }
