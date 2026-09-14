import type { AccountConfig } from "@/lib/config/schema"
import type { MailboxRow } from "@/lib/store/mailboxes"
import type { MailboxCounts, VirtualCounts, VirtualFolderKind } from "@/lib/store/messages"

type FolderRowKind = "virtual" | "account" | "mailbox"
type FolderCountTone = "unread" | "muted"

interface FolderRow {
  readonly key: string
  readonly kind: FolderRowKind
  readonly label: string
  readonly marker: string
  readonly indented: boolean
  readonly count: number
  readonly tone: FolderCountTone
  readonly accountId: string | undefined
  readonly mailboxPath: string | undefined
}

type FolderTarget =
  | { readonly kind: VirtualFolderKind }
  | { readonly kind: "mailbox"; readonly id: number }

interface FolderTreeInput {
  readonly accounts: readonly AccountConfig[]
  readonly mailboxes: readonly MailboxRow[]
  readonly counts: ReadonlyMap<number, MailboxCounts>
  readonly virtual: VirtualCounts
  readonly collapsed: ReadonlySet<string>
}

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
      kind: "virtual",
      label: "All emails",
      marker: "",
      indented: false,
      count: input.virtual.all,
      tone: "muted",
      accountId: undefined,
      mailboxPath: undefined,
    },
    {
      key: "virtual:unread",
      kind: "virtual",
      label: "All unread",
      marker: "",
      indented: false,
      count: input.virtual.unread,
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
