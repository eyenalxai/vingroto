import type { AccountConfig } from "@/lib/config/schema"
import type { MailboxRow } from "@/lib/store/mailboxes"
import type { MailboxCounts, VirtualFolderScope } from "@/lib/store/messages"

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
  readonly accountId: string | undefined
  readonly mailboxPath: string | undefined
}

type FolderTarget = VirtualFolderScope | { readonly kind: "mailbox"; readonly id: number }

interface FolderTreeInput {
  readonly accounts: readonly AccountConfig[]
  readonly mailboxes: readonly MailboxRow[]
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
    return { kind: "unread", accountId: undefined }
  }
  if (key.startsWith(accountUnreadPrefix)) {
    const accountId = key.slice(accountUnreadPrefix.length)
    return accountId.length === 0 ? undefined : { kind: "unread", accountId }
  }
  if (key.startsWith("mailbox:")) {
    const id = Number(key.slice("mailbox:".length))
    return Number.isNaN(id) ? undefined : { kind: "mailbox", id }
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
      accountId: undefined,
      mailboxPath: undefined,
    },
    {
      key: "virtual:unread",
      kind: "global",
      label: "All unread",
      marker: "",
      indented: false,
      count: input.unread,
      tone: "unread",
      accountId: undefined,
      mailboxPath: undefined,
    },
  ]
  for (const account of input.accounts) {
    const siblings = input.mailboxes.filter((row) => row.account_id === account.id)
    const folded = input.collapsed.has(account.id)
    let unread = 0
    for (const row of siblings) {
      unread += input.counts.get(row.id)?.unread ?? 0
    }
    rows.push({
      key: `account:${account.id}`,
      kind: "account",
      label: account.label,
      marker: folded ? "▸" : "▾",
      indented: false,
      count: unread,
      tone: "unread",
      accountId: account.id,
      mailboxPath: undefined,
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
      accountId: account.id,
      mailboxPath: undefined,
    })
    for (const row of siblings) {
      rows.push({
        key: `mailbox:${row.id}`,
        kind: "mailbox",
        label: row.name,
        marker: "",
        indented: true,
        count: input.counts.get(row.id)?.unread ?? 0,
        tone: "unread",
        accountId: account.id,
        mailboxPath: row.path,
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
