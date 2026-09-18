import type { MailAddress } from "@vingroto/core/mail/address"
import type { FetchMessageObject, ListResponse, MessageAddressObject } from "imapflow"

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
  entries.map((entry) => {
    return {
      path: entry.path,
      name: entry.name,
      delimiter: entry.delimiter,
      specialUse: entry.specialUse,
      selectable: !entry.flags.has(systemFlags.noSelect),
    }
  })

const toMailAddresses = (
  entries: readonly MessageAddressObject[] | undefined,
): readonly MailAddress[] => {
  const addresses: MailAddress[] = []
  for (const entry of entries ?? []) {
    if (entry.address !== undefined) {
      addresses.push(
        entry.name === undefined
          ? { address: entry.address }
          : { name: entry.name, address: entry.address },
      )
    }
  }
  return addresses
}

const toTimestamp = (value: Date | string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined
  }
  const date = value instanceof Date ? value : new Date(value)
  const time = date.getTime()
  return Number.isNaN(time) ? undefined : time
}

const toMessageEnvelope = (message: FetchMessageObject): MessageEnvelope => {
  const envelope = message.envelope
  const flags = message.flags ?? new Set<string>()
  return {
    uid: message.uid,
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
