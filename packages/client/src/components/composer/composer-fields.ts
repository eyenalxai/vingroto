import type { AccountConfig } from "@vingroto/core/config/schema"
import type { AccountId } from "@vingroto/core/ids"

type ComposerField = "from" | "to" | "cc" | "bcc" | "subject" | "body"

interface ComposerTexts {
  readonly to: string
  readonly cc: string
  readonly bcc: string
  readonly subject: string
  readonly body: string
}

const composerFields: readonly ComposerField[] = ["from", "to", "cc", "bcc", "subject", "body"]

const initialFromIndex = (
  accounts: readonly AccountConfig[],
  accountId: AccountId | undefined,
): number => {
  const index = accounts.findIndex((account) => account.id === accountId)
  return index === -1 ? 0 : index
}

const describeAccount = (account: AccountConfig | undefined): string => {
  if (account === undefined) {
    return "no account configured"
  }
  const name = account.name?.trim() ?? ""
  return name.length === 0
    ? `${account.label} — ${account.email}`
    : `${account.label} — ${name} <${account.email}>`
}

export { composerFields, describeAccount, initialFromIndex, type ComposerField, type ComposerTexts }
