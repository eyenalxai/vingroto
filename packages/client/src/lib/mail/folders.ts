import type { AccountConfig } from "@vingroto/core/config/schema"
import type { FolderScope, Mailbox, MailboxCounts } from "@vingroto/core/protocol/mail"

type FolderRowKind = "global" | "account" | "unread" | "mailbox"
type FolderCountTone = "unread" | "muted"

interface FolderRow {
  readonly key: string
  readonly kind: FolderRowKind
  readonly label: string
  readonly marker: string
  readonly indented: boolean
  readonly count: number | undefined
  readonly tone: FolderCountTone
  readonly muted: boolean
  readonly accountId: string | undefined
  readonly mailboxPath: string | undefined
  readonly mailboxId: number | undefined
}

type FolderTarget = FolderScope

interface FolderTreeInput {
  readonly accounts: readonly AccountConfig[]
  readonly mailboxes: readonly Mailbox[]
  readonly counts: ReadonlyMap<number, MailboxCounts>
  readonly unread: number
  readonly collapsed: ReadonlySet<string>
}

const accountUnreadPrefix = "virtual:unread:"

const parseFolderKey = (key: string | undefined): FolderTarget | undefined => {
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

const buildFolderRows = (input: FolderTreeInput): readonly FolderRow[] => {
  const rows: FolderRow[] = [
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
  buildFolderRows,
  parseFolderKey,
  type FolderCountTone,
  type FolderRow,
  type FolderRowKind,
  type FolderTarget,
  type FolderTreeInput,
}
