import type { AccountId, DraftId } from "@vingroto/core/ids"
import type { Draft } from "@vingroto/core/protocol/outgoing"

import { formatAddressList } from "@/lib/mail/address-text"

interface ComposerSeed {
  readonly accountId: AccountId | undefined
  readonly to: string
  readonly cc: string
  readonly bcc: string
  readonly subject: string
  readonly body: string
  readonly inReplyTo: string | undefined
  readonly references: readonly string[]
  readonly draftId: DraftId | undefined
}

const emptyComposerSeed = (accountId: AccountId | undefined): ComposerSeed => ({
  accountId,
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  body: "",
  inReplyTo: undefined,
  references: [],
  draftId: undefined,
})

const seedFromDraft = (draft: Draft): ComposerSeed => ({
  accountId: draft.accountId,
  to: formatAddressList(draft.to),
  cc: formatAddressList(draft.cc),
  bcc: formatAddressList(draft.bcc),
  subject: draft.subject,
  body: draft.body,
  inReplyTo: draft.inReplyTo ?? undefined,
  references: draft.references,
  draftId: draft.id,
})

export { emptyComposerSeed, seedFromDraft, type ComposerSeed }
