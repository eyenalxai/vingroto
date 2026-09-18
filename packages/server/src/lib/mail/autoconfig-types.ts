import type { ServerConfig } from "@vingroto/core/config/schema"

type Security = ServerConfig["security"]

interface PartialServers {
  readonly imap?: ServerConfig
  readonly smtp?: ServerConfig
  readonly username?: string
}

interface ParsedAutoconfig {
  readonly servers: PartialServers
  readonly redirect?: string
}

export type { ParsedAutoconfig, PartialServers, Security }
