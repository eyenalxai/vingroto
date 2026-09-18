import { XMLParser } from "fast-xml-parser"

import type { ParsedAutoconfig, PartialServers, Security } from "@/lib/mail/autoconfig-types"

import { ServerConfig } from "@/lib/config/schema"

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const asArray = (value: unknown): readonly unknown[] => {
  if (value === undefined || value === null) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}

const readString = (value: unknown): string | undefined => {
  const raw = typeof value === "number" ? String(value) : value
  const text = typeof raw === "string" ? raw.trim() : ""
  return text.length === 0 ? undefined : text
}

const readInteger = (value: unknown): number | undefined => {
  const text = readString(value)
  const parsed = text === undefined ? Number.NaN : Math.trunc(Number(text))
  return Number.isNaN(parsed) ? undefined : parsed
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

const pickServer = (value: unknown, type: string): Record<string, unknown> | undefined => {
  for (const candidate of asArray(value)) {
    if (!isRecord(candidate)) {
      continue
    }
    if (readString(candidate["@_type"])?.toLowerCase() === type) {
      return candidate
    }
  }
  return undefined
}

const serverFromRecord = (
  node: Record<string, unknown>,
  fallbackPort: number,
  fallbackSecurity: Security,
  replacements: Record<string, string>,
) => {
  const host = substitute(readString(node.hostname), replacements)
  if (host === undefined) {
    return host
  }
  return new ServerConfig({
    host,
    port: readInteger(node.port) ?? fallbackPort,
    security: securityFromSocketType(readString(node.socketType)) ?? fallbackSecurity,
  })
}

const parseAutoconfig = (
  xml: string,
  email: string,
  domain: string,
): ParsedAutoconfig | undefined => {
  const parsed = parser.parse(xml) as unknown
  if (!isRecord(parsed) || !isRecord(parsed.clientConfig)) {
    return undefined
  }
  const root = parsed.clientConfig
  const redirect = isRecord(root.redirect)
    ? readString(root.redirect["@_href"])
    : readString(root.redirect)
  const provider = asArray(root.emailProvider).find((candidate) => isRecord(candidate))
  if (provider === undefined || !isRecord(provider)) {
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
  const servers: PartialServers = { imap, smtp, username }
  return { servers, redirect: resolved ? undefined : redirect }
}

export { parseAutoconfig }
