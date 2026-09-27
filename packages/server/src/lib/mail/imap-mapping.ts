import type { MailAddress } from "@vingroto/core/mail/address"
import type { FetchMessageObject, ListResponse, MessageAddressObject } from "imapflow"

import { Uid } from "@vingroto/core/ids"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"

import type { MailboxInfo, MessageEnvelope } from "@/lib/mail/imap-types"

const systemFlags = {
  answered: String.raw`\Answered`,
  deleted: String.raw`\Deleted`,
  draft: String.raw`\Draft`,
  flagged: String.raw`\Flagged`,
  noSelect: String.raw`\Noselect`,
  recent: String.raw`\Recent`,
  seen: String.raw`\Seen`,
} as const

const systemFlagNames: ReadonlySet<string> = new Set([
  systemFlags.answered,
  systemFlags.deleted,
  systemFlags.draft,
  systemFlags.flagged,
  systemFlags.recent,
  systemFlags.seen,
])

const toMailboxInfos = (entries: readonly ListResponse[]): readonly MailboxInfo[] =>
  entries.map((entry) => ({
    path: entry.path,
    name: entry.name,
    delimiter: entry.delimiter,
    specialUse: entry.specialUse,
    selectable: !entry.flags.has(systemFlags.noSelect),
  }))

const toMailAddresses = (
  entries: readonly MessageAddressObject[] | undefined,
): readonly MailAddress[] => {
  const addresses: MailAddress[] = []
  for (const entry of entries ?? []) {
    if (entry.address !== undefined) {
      const name = entry.name
      addresses.push(
        name === undefined || name.trim().length === 0
          ? { address: entry.address }
          : { name, address: entry.address },
      )
    }
  }
  return addresses
}

const toTimestamp = (value: Date | string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined
  }
  const date = DateTime.make(value)
  return Option.isSome(date) ? DateTime.toEpochMillis(date.value) : undefined
}

const toMessageEnvelope = (message: FetchMessageObject): MessageEnvelope => {
  const envelope = message.envelope
  const flags = message.flags ?? new Set<string>()
  return {
    uid: Uid.make(message.uid),
    messageId: envelope?.messageId,
    inReplyTo: envelope?.inReplyTo,
    subject: envelope?.subject,
    from: toMailAddresses(envelope?.from),
    to: toMailAddresses(envelope?.to),
    cc: toMailAddresses(envelope?.cc),
    date: toTimestamp(envelope?.date) ?? toTimestamp(message.internalDate),
    size: message.size,
    seen: flags.has(systemFlags.seen),
    answered: flags.has(systemFlags.answered),
    flagged: flags.has(systemFlags.flagged),
    draft: flags.has(systemFlags.draft),
    keywords: [...flags].filter((flag) => !systemFlagNames.has(flag)),
  }
}

export { toMailboxInfos, toMessageEnvelope }
