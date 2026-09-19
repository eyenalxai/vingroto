import type { AccountConfig } from "@vingroto/core/config/schema"
import type { MailAddress } from "@vingroto/core/mail/address"
import type { MessageDetail } from "@vingroto/core/protocol/mail"

import type { ComposerSeed } from "@/lib/mail/compose"

import { formatMessageDateTime, senderLabel } from "@/lib/format"
import { addressKey, formatAddressList } from "@/lib/mail/address-text"
import { renderBodyText } from "@/lib/mail/body-text"

interface ReplyInput {
  readonly detail: MessageDetail
  readonly accounts: readonly AccountConfig[]
  readonly body: { readonly text: string | null; readonly html: string | null }
  readonly all: boolean
}

const replySubject = (subject: string | null): string => {
  const value = subject?.trim() ?? ""
  if (value.length === 0) {
    return "Re:"
  }
  return /^re:/iu.test(value) ? value : `Re: ${value}`
}

const senderAddress = (detail: MessageDetail): MailAddress | undefined => {
  const address = detail.fromAddress?.trim() ?? ""
  if (address.length === 0) {
    return undefined
  }
  const name = detail.fromName?.trim() ?? ""
  return name.length === 0 ? { address } : { name, address }
}

const appendUnique = (
  target: MailAddress[],
  address: MailAddress,
  ownAddress: string,
  seen: Set<string>,
) => {
  const key = addressKey(address)
  if (key === ownAddress || seen.has(key)) {
    return
  }
  seen.add(key)
  target.push(address)
}

const quoteBody = (text: string, detail: MessageDetail): string => {
  const quoted = text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")
  const sender = senderLabel(detail.fromName, detail.fromAddress)
  const date = formatMessageDateTime(detail.date)
  return `\n\nOn ${date}, ${sender} wrote:\n${quoted}`
}

const buildReplySeed = (input: ReplyInput): ComposerSeed => {
  const account = input.accounts.find((entry) => entry.id === input.detail.accountId)
  const ownAddress = account?.email.trim().toLowerCase() ?? ""
  const seen = new Set<string>()
  const to: MailAddress[] = []
  const sender = senderAddress(input.detail)
  if (sender !== undefined) {
    appendUnique(to, sender, ownAddress, seen)
  }
  const cc: MailAddress[] = []
  if (input.all) {
    for (const address of input.detail.to ?? []) {
      appendUnique(to, address, ownAddress, seen)
    }
    for (const address of input.detail.cc ?? []) {
      appendUnique(cc, address, ownAddress, seen)
    }
  }
  const references = [...(input.detail.references ?? [])]
  if (input.detail.messageId !== null && !references.includes(input.detail.messageId)) {
    references.push(input.detail.messageId)
  }
  const quoted = quoteBody(renderBodyText(input.body.text, input.body.html), input.detail)
  return {
    accountId: input.detail.accountId,
    to: formatAddressList(to),
    cc: formatAddressList(cc),
    bcc: "",
    subject: replySubject(input.detail.subject),
    body: quoted,
    inReplyTo: input.detail.messageId ?? undefined,
    references,
    draftId: undefined,
  }
}

export { buildReplySeed, type ReplyInput }
