import type { ServerConfig } from "@vingroto/core/config/schema"

import { describeError } from "@vingroto/core/errors"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import { XMLParser } from "fast-xml-parser"

import type { ParsedAutoconfig, PartialServers, Security } from "@/lib/mail/autoconfig-types"

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
})

const TextValue = Schema.Union([Schema.String, Schema.Finite])

const ServerNode = Schema.Struct({
  "@_type": Schema.optionalKey(Schema.Unknown),
  hostname: Schema.optionalKey(Schema.Unknown),
  port: Schema.optionalKey(Schema.Unknown),
  socketType: Schema.optionalKey(Schema.Unknown),
  username: Schema.optionalKey(Schema.Unknown),
})

const EmailProviderNode = Schema.Struct({
  incomingServer: Schema.optionalKey(Schema.ArrayEnsure(ServerNode)),
  outgoingServer: Schema.optionalKey(Schema.ArrayEnsure(ServerNode)),
})

const RedirectNode = Schema.Union([
  TextValue,
  Schema.Struct({ "@_href": Schema.optionalKey(Schema.Unknown) }),
])

const AutoconfigDocument = Schema.Struct({
  clientConfig: Schema.Struct({
    emailProvider: Schema.optionalKey(Schema.ArrayEnsure(EmailProviderNode)),
    redirect: Schema.optionalKey(RedirectNode),
  }),
})

const decodeDocument = Schema.decodeUnknownOption(AutoconfigDocument)

const readString = (value: unknown): string | undefined => {
  const decoded = Schema.decodeUnknownOption(TextValue)(value)
  if (Option.isNone(decoded)) {
    return undefined
  }
  const text = String(decoded.value).trim()
  return text.length === 0 ? undefined : text
}

const readInteger = (value: unknown): number | undefined => {
  const text = readString(value)
  if (text === undefined) {
    return undefined
  }
  const decoded = Schema.decodeOption(Schema.FiniteFromString)(text)
  return Option.isSome(decoded) ? Math.trunc(decoded.value) : undefined
}

const substitute = (value: string | undefined, replacements: Record<string, string>) => {
  if (value === undefined) {
    return value
  }
  let result = value
  for (const [placeholder, replacement] of Object.entries(replacements)) {
    result = result.replaceAll(placeholder, replacement)
  }
  return result
}

const securityFromSocketType = (value: string | undefined): Security | undefined => {
  const normalized = value?.toUpperCase()
  if (normalized === "SSL" || normalized === "TLS") {
    return "tls"
  }
  if (normalized === "STARTTLS") {
    return "starttls"
  }
  if (normalized === "PLAIN" || normalized === "NONE") {
    return "none"
  }
  return undefined
}

const readRedirect = (node: typeof RedirectNode.Type): string | undefined => {
  if (Predicate.isObject(node)) {
    return readString(node["@_href"])
  }
  return readString(node)
}

const pickServer = (nodes: readonly (typeof ServerNode.Type)[] | undefined, type: string) =>
  nodes?.find((node) => readString(node["@_type"])?.toLowerCase() === type)

const serverFromRecord = (
  node: typeof ServerNode.Type,
  fallbackPort: number,
  fallbackSecurity: Security,
  replacements: Record<string, string>,
): ServerConfig | undefined => {
  const host = substitute(readString(node.hostname), replacements)
  if (host === undefined) {
    return undefined
  }
  return {
    host,
    port: readInteger(node.port) ?? fallbackPort,
    security: securityFromSocketType(readString(node.socketType)) ?? fallbackSecurity,
  }
}

class AutoconfigParseError extends Schema.TaggedError<AutoconfigParseError>()(
  "AutoconfigParseError",
  {
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

const parseAutoconfig = Effect.fn("Autoconfig.parse")(function* parseAutoconfigDocument(
  xml: string,
  email: string,
  domain: string,
): Effect.fn.Return<ParsedAutoconfig | undefined, AutoconfigParseError> {
  const document = yield* Effect.try({
    try: () => decodeDocument(parser.parse(xml)),
    catch: (cause: unknown) => new AutoconfigParseError({ message: describeError(cause), cause }),
  })
  if (Option.isNone(document)) {
    return undefined
  }
  const root = document.value.clientConfig
  const redirect = root.redirect === undefined ? undefined : readRedirect(root.redirect)
  const provider = root.emailProvider?.[0]
  if (provider === undefined) {
    return redirect === undefined ? undefined : { servers: {}, redirect }
  }
  const replacements = {
    "%EMAILADDRESS%": email,
    "%EMAILDOMAIN%": domain,
    "%EMAILLOCALPART%": email.slice(0, email.lastIndexOf("@")),
  }
  const imapNode = pickServer(provider.incomingServer, "imap")
  const smtpNode = pickServer(provider.outgoingServer, "smtp")
  const imap =
    imapNode === undefined ? undefined : serverFromRecord(imapNode, 993, "tls", replacements)
  const smtp =
    smtpNode === undefined ? undefined : serverFromRecord(smtpNode, 465, "tls", replacements)
  const username = substitute(
    imapNode === undefined ? undefined : readString(imapNode.username),
    replacements,
  )
  const resolved = imap !== undefined || smtp !== undefined
  const servers: PartialServers = {
    ...(imap === undefined ? {} : { imap }),
    ...(smtp === undefined ? {} : { smtp }),
    ...(username === undefined ? {} : { username }),
  }
  return redirect === undefined || resolved ? { servers } : { servers, redirect }
})

export { AutoconfigParseError, parseAutoconfig }
