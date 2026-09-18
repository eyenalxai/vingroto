import type { ServerConfig } from "@vingroto/core/config/schema"

type Security = "tls" | "starttls" | "none"

interface DiscoveredServers {
  readonly imap: ServerConfig
  readonly smtp: ServerConfig
  readonly username?: string
  readonly source: string
}

type DiscoveryResult =
  | { readonly _tag: "found"; readonly servers: DiscoveredServers }
  | { readonly _tag: "not-found"; readonly attempts: readonly string[] }

interface PartialServers {
  readonly imap?: ServerConfig
  readonly smtp?: ServerConfig
  readonly username?: string
}

interface ParsedAutoconfig {
  readonly servers: PartialServers
  readonly redirect?: string
}

export type { DiscoveredServers, DiscoveryResult, ParsedAutoconfig, PartialServers, Security }
