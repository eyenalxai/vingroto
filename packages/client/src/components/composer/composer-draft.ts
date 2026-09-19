import type { AccountConfig } from "@vingroto/core/config/schema"
import type { DraftId } from "@vingroto/core/ids"
import type { MailAddress } from "@vingroto/core/mail/address"
import type { OutboxEntry } from "@vingroto/core/protocol/outgoing"

import { Effect } from "effect"

import type { ComposerTexts } from "@/components/composer/composer-fields"
import type { MailClientError } from "@/lib/api"
import type { ComposerSeed } from "@/lib/mail/compose"

import { MailClient } from "@/lib/api"
import { parseAddressList } from "@/lib/mail/address-text"

type PersistOutcome =
  | { readonly _tag: "saved"; readonly draftId: DraftId }
  | { readonly _tag: "deleted" }
  | { readonly _tag: "empty" }

type RecipientParse =
  | {
      readonly _tag: "ok"
      readonly to: readonly MailAddress[]
      readonly cc: readonly MailAddress[]
      readonly bcc: readonly MailAddress[]
    }
  | { readonly _tag: "error"; readonly field: "to" | "cc" | "bcc"; readonly message: string }

interface ComposerMessageInput {
  readonly account: AccountConfig
  readonly texts: ComposerTexts
  readonly recipients: Extract<RecipientParse, { _tag: "ok" }>
  readonly seed: ComposerSeed
  readonly draftId: DraftId | undefined
}

type RecipientValidation =
  | {
      readonly _tag: "ok"
      readonly recipients: Extract<RecipientParse, { _tag: "ok" }>
    }
  | { readonly _tag: "invalid"; readonly field: "to" | "cc" | "bcc"; readonly message: string }

const parseRecipients = (texts: ComposerTexts): RecipientParse => {
  const to = parseAddressList(texts.to)
  const cc = parseAddressList(texts.cc)
  const bcc = parseAddressList(texts.bcc)
  if (to._tag === "error") {
    return { _tag: "error", field: "to", message: to.message }
  }
  if (cc._tag === "error") {
    return { _tag: "error", field: "cc", message: cc.message }
  }
  if (bcc._tag === "error") {
    return { _tag: "error", field: "bcc", message: bcc.message }
  }
  return { _tag: "ok", to: to.addresses, cc: cc.addresses, bcc: bcc.addresses }
}

const validateRecipients = (texts: ComposerTexts): RecipientValidation => {
  const parsed = parseRecipients(texts)
  if (parsed._tag === "error") {
    return { _tag: "invalid", field: parsed.field, message: parsed.message }
  }
  if (parsed.to.length === 0) {
    return { _tag: "invalid", field: "to", message: "add at least one recipient" }
  }
  return { _tag: "ok", recipients: parsed }
}

const saveDraft = (
  input: ComposerMessageInput,
): Effect.Effect<PersistOutcome, MailClientError, MailClient> =>
  Effect.gen(function* persistComposerDraft() {
    const { texts, recipients, seed, account, draftId } = input
    const whollyEmpty =
      texts.to.trim().length === 0 &&
      texts.cc.trim().length === 0 &&
      texts.bcc.trim().length === 0 &&
      texts.subject.trim().length === 0 &&
      texts.body.trim().length === 0
    if (whollyEmpty) {
      if (draftId === undefined) {
        return { _tag: "empty" }
      }
      const client = yield* MailClient
      yield* client.deleteDraft(draftId)
      return { _tag: "deleted" }
    }
    const client = yield* MailClient
    const saved = yield* client.saveDraft({
      accountId: account.id,
      to: recipients.to,
      cc: recipients.cc,
      bcc: recipients.bcc,
      subject: texts.subject,
      body: texts.body,
      references: seed.references,
      ...(seed.inReplyTo === undefined ? {} : { inReplyTo: seed.inReplyTo }),
      ...(draftId === undefined ? {} : { draftId }),
    })
    return { _tag: "saved", draftId: saved.id }
  })

const enqueueMessage = (
  input: ComposerMessageInput,
): Effect.Effect<OutboxEntry, MailClientError, MailClient> =>
  Effect.gen(function* enqueueComposerMessage() {
    const { texts, recipients, seed, account, draftId } = input
    const client = yield* MailClient
    return yield* client.enqueueMessage({
      accountId: account.id,
      to: recipients.to,
      cc: recipients.cc,
      bcc: recipients.bcc,
      subject: texts.subject,
      body: texts.body,
      references: seed.references,
      ...(seed.inReplyTo === undefined ? {} : { inReplyTo: seed.inReplyTo }),
      ...(draftId === undefined ? {} : { draftId }),
    })
  })

export {
  enqueueMessage,
  parseRecipients,
  saveDraft,
  validateRecipients,
  type ComposerMessageInput,
  type PersistOutcome,
  type RecipientParse,
  type RecipientValidation,
}
