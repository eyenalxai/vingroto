import type { AccountConfig } from "@vingroto/core/config/schema"
import type { DraftId } from "@vingroto/core/ids"
import type { MailAddress } from "@vingroto/core/mail/address"
import type { OutboxEntry } from "@vingroto/core/protocol/outgoing"

import { Effect } from "effect"
import * as Data from "effect/Data"

import type { ComposerTexts } from "@/components/composer/composer-fields"
import type { MailClientError } from "@/lib/api"
import type { ComposerSeed } from "@/lib/mail/compose"

import { MailClient } from "@/lib/api"
import { parseAddressList } from "@/lib/mail/address-text"

type PersistOutcome = Data.TaggedEnum<{
  saved: { readonly draftId: DraftId }
  deleted: Record<never, never>
  empty: Record<never, never>
}>

const persistOutcome = Data.taggedEnum<PersistOutcome>()

type RecipientParse = Data.TaggedEnum<{
  ok: {
    readonly to: readonly MailAddress[]
    readonly cc: readonly MailAddress[]
    readonly bcc: readonly MailAddress[]
  }
  error: { readonly field: "to" | "cc" | "bcc"; readonly message: string }
}>

const recipientParse = Data.taggedEnum<RecipientParse>()

interface ComposerMessageInput {
  readonly account: AccountConfig
  readonly texts: ComposerTexts
  readonly recipients: Extract<RecipientParse, { _tag: "ok" }>
  readonly seed: ComposerSeed
  readonly draftId: DraftId | undefined
}

type RecipientValidation = Data.TaggedEnum<{
  ok: {
    readonly recipients: Extract<RecipientParse, { _tag: "ok" }>
  }
  invalid: { readonly field: "to" | "cc" | "bcc"; readonly message: string }
}>

const recipientValidation = Data.taggedEnum<RecipientValidation>()

const parseRecipients = (texts: ComposerTexts): RecipientParse => {
  const to = parseAddressList(texts.to)
  const cc = parseAddressList(texts.cc)
  const bcc = parseAddressList(texts.bcc)
  if (to._tag === "error") {
    return recipientParse.error({ field: "to", message: to.message })
  }
  if (cc._tag === "error") {
    return recipientParse.error({ field: "cc", message: cc.message })
  }
  if (bcc._tag === "error") {
    return recipientParse.error({ field: "bcc", message: bcc.message })
  }
  return recipientParse.ok({ to: to.addresses, cc: cc.addresses, bcc: bcc.addresses })
}

const validateRecipients = (texts: ComposerTexts): RecipientValidation => {
  const parsed = parseRecipients(texts)
  if (parsed._tag === "error") {
    return recipientValidation.invalid({ field: parsed.field, message: parsed.message })
  }
  if (parsed.to.length === 0) {
    return recipientValidation.invalid({ field: "to", message: "add at least one recipient" })
  }
  return recipientValidation.ok({ recipients: parsed })
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
        return persistOutcome.empty()
      }
      const client = yield* MailClient
      yield* client.deleteDraft(draftId)
      return persistOutcome.deleted()
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
    return persistOutcome.saved({ draftId: saved.id })
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
