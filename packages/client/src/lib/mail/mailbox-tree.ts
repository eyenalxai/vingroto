import type { AccountConfig } from "@vingroto/core/config/schema"
import type { ListScope, Mailbox, MailboxCounts } from "@vingroto/core/protocol/mail"

import { AccountId, MailboxId } from "@vingroto/core/ids"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

type MailboxTreeRowKind = "global" | "account" | "unread" | "mailbox"
type CountTone = "attention" | "quiet"

interface MailboxTreeRow {
  readonly key: string
  readonly kind: MailboxTreeRowKind
  readonly label: string
  readonly marker: string
  readonly indented: boolean
  readonly count: number | undefined
  readonly countTone: CountTone
  readonly muted: boolean
  readonly accountId: AccountId | undefined
  readonly mailboxPath: string | undefined
  readonly mailboxId: MailboxId | undefined
}

type ListTarget = ListScope

interface MailboxTreeInput {
  readonly accounts: readonly AccountConfig[]
  readonly mailboxes: readonly Mailbox[]
  readonly counts: ReadonlyMap<MailboxId, MailboxCounts>
  readonly unread: number
  readonly collapsed: ReadonlySet<AccountId>
}

const accountUnreadPrefix = "virtual:unread:"

const parseMailboxId = Schema.decodeUnknownOption(MailboxId)

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
    return accountId.length === 0
      ? undefined
      : { kind: "unread", accountId: AccountId.make(accountId) }
  }
  if (key.startsWith("mailbox:")) {
    const mailboxId = parseMailboxId(Number(key.slice("mailbox:".length)))
    return Option.isSome(mailboxId) ? { kind: "mailbox", mailboxId: mailboxId.value } : undefined
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
      countTone: "quiet",
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
      countTone: "attention",
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
      countTone: "attention",
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
      countTone: "attention",
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
        count: input.counts.get(row.id)?.unread ?? 0,
        countTone: row.muted ? "quiet" : "attention",
        muted: row.muted,
        accountId: account.id,
        mailboxPath: row.path,
        mailboxId: row.id,
      })
    }
  }
  return rows
}

const rowKeyAfterMove = (
  rows: readonly MailboxTreeRow[],
  current: string | undefined,
  delta: number,
): string | undefined => {
  const index = rows.findIndex((row) => row.key === current)
  const clamped = Math.min(Math.max(index === -1 ? 0 : index + delta, 0), rows.length - 1)
  return rows[clamped]?.key
}

const createInitialRowKeySelector = () => {
  let previousRows: readonly MailboxTreeRow[] = []

  return (rows: readonly MailboxTreeRow[], current: string | undefined): string | undefined => {
    const previous = previousRows
    previousRows = rows
    if (current !== undefined && rows.some((row) => row.key === current)) {
      return current
    }
    if (current === undefined) {
      const mailboxRows = rows.filter((row) => row.kind === "mailbox")
      const inbox = mailboxRows.find((row) => row.label.toLowerCase() === "inbox")
      return (inbox ?? mailboxRows[0] ?? rows[0])?.key
    }
    const previousIndex = previous.findIndex((row) => row.key === current)
    const index = Math.min(Math.max(previousIndex, 0), rows.length - 1)
    return (rows[index] ?? rows[0])?.key
  }
}

export {
  buildMailboxTreeRows,
  createInitialRowKeySelector,
  parseListKey,
  rowKeyAfterMove,
  type CountTone,
  type MailboxTreeRow,
  type MailboxTreeRowKind,
  type ListTarget,
  type MailboxTreeInput,
}
