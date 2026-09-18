import type { AccountConfig } from "@vingroto/core/config/schema"
import type { Mailbox, MessageListItem } from "@vingroto/core/protocol/mail"

type MoveTargetsResult =
  | {
      readonly _tag: "ok"
      readonly accountId: string
      readonly accountLabel: string
      readonly mailboxes: readonly Mailbox[]
    }
  | { readonly _tag: "error"; readonly message: string }

const resolveMoveTargets = (
  items: readonly MessageListItem[],
  accounts: readonly AccountConfig[],
  mailboxes: readonly Mailbox[],
): MoveTargetsResult => {
  if (items.length === 0) {
    return { _tag: "error", message: "select a message to move" }
  }
  const accountIds = new Set(items.map((item) => item.accountId))
  const accountId = items[0]?.accountId
  if (accountIds.size !== 1 || accountId === undefined) {
    return { _tag: "error", message: "select messages from one account to move them" }
  }
  const account = accounts.find((entry) => entry.id === accountId)
  if (account === undefined) {
    return { _tag: "error", message: `account ${accountId} is not configured` }
  }
  const sources = new Set(items.map((item) => item.mailboxPath))
  const candidates = mailboxes.filter(
    (mailbox) =>
      mailbox.account_id === accountId && mailbox.selectable && !sources.has(mailbox.path),
  )
  if (candidates.length === 0) {
    return { _tag: "error", message: "no other mailbox in this account" }
  }
  return { _tag: "ok", accountId, accountLabel: account.label, mailboxes: candidates }
}

export { resolveMoveTargets, type MoveTargetsResult }
