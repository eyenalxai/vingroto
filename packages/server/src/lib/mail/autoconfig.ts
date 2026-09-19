import type { ServerConfig } from "@vingroto/core/config/schema"
import type { DiscoveryResult } from "@vingroto/core/protocol/accounts"

import { describeError } from "@vingroto/core/errors"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"

import type { ParsedAutoconfig, PartialServers } from "@/lib/mail/autoconfig-types"

import { srvServers } from "@/lib/mail/autoconfig-srv"
import { parseAutoconfig } from "@/lib/mail/autoconfig-xml"

const requestTimeout = Duration.seconds(10)

const retrySchedule = Schedule.exponential("500 millis").pipe(
  Schedule.jittered,
  Schedule.upTo({ times: 2 }),
)

const hasServers = (servers: PartialServers) =>
  servers.imap !== undefined || servers.smtp !== undefined

const emailDomain = (email: string): string | undefined => {
  const at = email.lastIndexOf("@")
  const domain = at <= 0 ? "" : email.slice(at + 1).trim()
  return domain.length === 0 ? undefined : domain
}

const fetchText = Effect.fn("Discovery.fetchText")(function* fetchDocument(
  client: HttpClient.HttpClient,
  url: string,
  attempts: string[],
): Effect.fn.Return<string | null> {
  return yield* client.get(url).pipe(
    Effect.flatMap((response) => {
      if (response.status !== 200) {
        attempts.push(`${url} returned HTTP ${response.status}`)
        return Effect.succeed(null)
      }
      return response.text
    }),
    Effect.timeout(requestTimeout),
    Effect.catchTags({
      HttpClientError: (error) => {
        attempts.push(`${url} failed: ${describeError(error)}`)
        return Effect.succeed(null)
      },
      TimeoutError: () => {
        attempts.push(`${url} timed out after ${Duration.toSeconds(requestTimeout)}s`)
        return Effect.succeed(null)
      },
    }),
  )
})

// A null result means the document could not be parsed, undefined that it parsed but had no servers.
const parseProvider = Effect.fn("Discovery.parseProvider")(function* parseProvider(
  url: string,
  text: string,
  email: string,
  domain: string,
  attempts: string[],
): Effect.fn.Return<ParsedAutoconfig | null | undefined> {
  return yield* parseAutoconfig(text, email, domain).pipe(
    Effect.catchTag("AutoconfigParseError", (error) => {
      attempts.push(`${url}: ${error.message}`)
      return Effect.succeed(null)
    }),
  )
})

const autoconfigServers = Effect.fn("Discovery.autoconfigServers")(function* detectAutoconfig(
  client: HttpClient.HttpClient,
  email: string,
  domain: string,
  attempts: string[],
): Effect.fn.Return<PartialServers> {
  const urls = [
    `https://autoconfig.${domain}/mail/config-v1.1.xml`,
    `https://${domain}/.well-known/autoconfig/mail/config-v1.1.xml`,
    `https://autoconfig.thunderbird.net/v1.1/${domain}`,
  ]
  for (const url of urls) {
    const text = yield* fetchText(client, url, attempts)
    if (text === null) {
      continue
    }
    const parsed = yield* parseProvider(url, text, email, domain, attempts)
    if (parsed === null) {
      continue
    }
    if (parsed === undefined) {
      attempts.push(`${url}: unrecognized provider configuration`)
      continue
    }
    if (parsed.redirect !== undefined) {
      const redirected = yield* fetchText(client, parsed.redirect, attempts)
      if (redirected === null) {
        continue
      }
      const resolved = yield* parseProvider(parsed.redirect, redirected, email, domain, attempts)
      if (resolved !== null && resolved !== undefined && hasServers(resolved.servers)) {
        return resolved.servers
      }
      continue
    }
    if (hasServers(parsed.servers)) {
      return parsed.servers
    }
  }
  return {}
})

const guessImap = (domain: string): ServerConfig => {
  return { host: `imap.${domain}`, port: 993, security: "tls" }
}

const guessSmtp = (domain: string): ServerConfig => {
  return { host: `smtp.${domain}`, port: 465, security: "tls" }
}

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

const discover = Effect.fn("Discovery.discover")(function* discover(
  client: HttpClient.HttpClient,
  email: string,
): Effect.fn.Return<DiscoveryResult> {
  const domain = emailDomain(email)
  const attempts: string[] = []
  if (domain === undefined) {
    return { _tag: "not-found", attempts: ["the email address is missing a domain"] }
  }
  const fromXml = yield* autoconfigServers(client, email, domain, attempts)
  const fromSrv: PartialServers = hasServers(fromXml) ? {} : yield* srvServers(domain, attempts)
  const imap = fromXml.imap ?? fromSrv.imap ?? guessImap(domain)
  const smtp = fromXml.smtp ?? fromSrv.smtp ?? guessSmtp(domain)
  return {
    _tag: "found",
    servers: {
      imap,
      smtp,
      ...(fromXml.username === undefined ? {} : { username: fromXml.username }),
      source: describeSource(fromXml, fromSrv),
    },
  }
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
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.retryTransient({
          retryOn: "errors-and-responses",
          schedule: retrySchedule,
        }),
      )
      return Discovery.of({
        discover: (email: string) => discover(client, email),
      })
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer))
}

export { Discovery, type DiscoveryShape }
