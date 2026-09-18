import type { AccountConfig } from "@vingroto/core/config/schema"
import type { ListScope, Mailbox, MailboxCounts } from "@vingroto/core/protocol/mail"

type MailboxTreeRowKind = "global" | "account" | "unread" | "mailbox"
type CountTone = "unread" | "muted"

interface MailboxTreeRow {
  readonly key: string
  readonly kind: MailboxTreeRowKind
  readonly label: string
  readonly marker: string
  readonly indented: boolean
  readonly count: number | undefined
  readonly tone: CountTone
  readonly muted: boolean
  readonly accountId: string | undefined
  readonly mailboxPath: string | undefined
  readonly mailboxId: number | undefined
}

type ListTarget = ListScope

interface MailboxTreeInput {
  readonly accounts: readonly AccountConfig[]
  readonly mailboxes: readonly Mailbox[]
  readonly counts: ReadonlyMap<number, MailboxCounts>
  readonly unread: number
  readonly collapsed: ReadonlySet<string>
}

const accountUnreadPrefix = "virtual:unread:"

const parseListKey = (key: string | undefined): ListTarget | undefined => {
  if (key === undefined) {
    return undefined
  }
  if (key === "virtual:all") {
    return { kind: "all" }
  }
  if (key === "virtual:unread") {
    return { kind: "unread" }
  }
  if (key.startsWith(accountUnreadPrefix)) {
    const accountId = key.slice(accountUnreadPrefix.length)
    return accountId.length === 0 ? undefined : { kind: "unread", accountId }
  }
  if (key.startsWith("mailbox:")) {
    const id = Number(key.slice("mailbox:".length))
    return Number.isNaN(id) ? undefined : { kind: "mailbox", mailboxId: id }
  }
  return undefined
}

const buildMailboxTreeRows = (input: MailboxTreeInput): readonly MailboxTreeRow[] => {
  const rows: MailboxTreeRow[] = [
    {
      key: "virtual:all",
      kind: "global",
      label: "All emails",
      marker: "",
      indented: false,
      count: undefined,
      tone: "muted",
      muted: false,
      accountId: undefined,
      mailboxPath: undefined,
      mailboxId: undefined,
    },
    {
      key: "virtual:unread",
      kind: "global",
      label: "All unread",
      marker: "",
      indented: false,
      count: input.unread,
      tone: "unread",
      muted: false,
      accountId: undefined,
      mailboxPath: undefined,
      mailboxId: undefined,
    },
  ]
  for (const account of input.accounts) {
    const siblings = input.mailboxes.filter((row) => row.account_id === account.id)
    const folded = input.collapsed.has(account.id)
    let unread = 0
    for (const row of siblings) {
      if (!row.muted) {
        unread += input.counts.get(row.id)?.unread ?? 0
      }
    }
    rows.push({
      key: `account:${account.id}`,
      kind: "account",
      label: account.label,
      marker: folded ? "▸" : "▾",
      indented: false,
      count: unread,
      tone: "unread",
      muted: false,
      accountId: account.id,
      mailboxPath: undefined,
      mailboxId: undefined,
    })
    if (folded) {
      continue
    }
    rows.push({
      key: `${accountUnreadPrefix}${account.id}`,
      kind: "unread",
      label: "Unread",
      marker: "",
      indented: true,
      count: unread,
      tone: "unread",
      muted: false,
      accountId: account.id,
      mailboxPath: undefined,
      mailboxId: undefined,
    })
    for (const row of siblings) {
      rows.push({
        key: `mailbox:${row.id}`,
        kind: "mailbox",
        label: row.name,
        marker: row.muted ? "⊘" : "",
        indented: true,
        count: row.muted ? 0 : (input.counts.get(row.id)?.unread ?? 0),
        tone: row.muted ? "muted" : "unread",
        muted: row.muted,
        accountId: account.id,
        mailboxPath: row.path,
        mailboxId: row.id,
      })
    }
  }
  return rows
}

export {
  buildMailboxTreeRows,
  parseListKey,
  type CountTone,
  type MailboxTreeRow,
  type MailboxTreeRowKind,
  type ListTarget,
  type MailboxTreeInput,
}
