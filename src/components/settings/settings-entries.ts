import type { AccountConfig, SyncConfig } from "@/lib/config/schema"
import type { MailboxRow } from "@/lib/store/mailboxes"

import { matchesQuery, queryTerms } from "@/lib/search"

type SettingsSection = "Accounts" | "Folders" | "Sync"

interface SettingsEntryBase {
  readonly key: string
  readonly section: SettingsSection
  readonly title: string
  readonly subtitle: string
}

type SettingsEntry =
  | (SettingsEntryBase & { readonly kind: "add-account" })
  | (SettingsEntryBase & { readonly kind: "account"; readonly accountId: string })
  | (SettingsEntryBase & { readonly kind: "folder-group"; readonly accountId: string })
  | (SettingsEntryBase & {
      readonly kind: "folder"
      readonly mailboxId: number
      readonly accountId: string
      readonly parentKey: string
      readonly path: string
      readonly name: string
      readonly muted: boolean
    })
  | (SettingsEntryBase & { readonly kind: "sync" })

interface SettingsGroup {
  readonly section: SettingsSection
  readonly entries: readonly SettingsEntry[]
}

interface SettingsEntriesInput {
  readonly accounts: readonly AccountConfig[]
  readonly mailboxes: readonly MailboxRow[]
  readonly sync: SyncConfig
}

const sectionOrder: readonly SettingsSection[] = ["Accounts", "Folders", "Sync"]

const folderGroupKey = (accountId: string) => `folders:${accountId}`

const buildSettingsEntries = (input: SettingsEntriesInput): readonly SettingsEntry[] => {
  const entries: SettingsEntry[] = [
    {
      kind: "add-account",
      key: "add-account",
      section: "Accounts",
      title: "+ Add account",
      subtitle: "connect another mailbox",
    },
  ]
  for (const account of input.accounts) {
    entries.push({
      kind: "account",
      key: `account:${account.id}`,
      section: "Accounts",
      title: account.label,
      subtitle: account.email,
      accountId: account.id,
    })
  }
  for (const account of input.accounts) {
    const mailboxes = input.mailboxes
      .filter((row) => row.account_id === account.id && row.selectable)
      .toSorted((left, right) => left.path.localeCompare(right.path))
    const count = mailboxes.length
    entries.push({
      kind: "folder-group",
      key: folderGroupKey(account.id),
      section: "Folders",
      title: account.label,
      subtitle: `${account.email} · ${String(count)} ${count === 1 ? "folder" : "folders"}`,
      accountId: account.id,
    })
    for (const mailbox of mailboxes) {
      entries.push({
        kind: "folder",
        key: `folder:${mailbox.id}`,
        section: "Folders",
        title: mailbox.name,
        subtitle: mailbox.path,
        mailboxId: mailbox.id,
        accountId: account.id,
        parentKey: folderGroupKey(account.id),
        path: mailbox.path,
        name: mailbox.name,
        muted: mailbox.muted,
      })
    }
  }
  entries.push({
    kind: "sync",
    key: "sync",
    section: "Sync",
    title: "Sync settings",
    subtitle: `${input.sync.initialDays} days back · every ${input.sync.intervalMinutes} min`,
  })
  return entries
}

const entryHaystack = (entry: SettingsEntry) => `${entry.title} ${entry.subtitle} ${entry.section}`

const filterSettingsEntries = (
  entries: readonly SettingsEntry[],
  query: string,
): readonly SettingsEntry[] => {
  if (queryTerms(query).length === 0) {
    return entries
  }
  const directMatches = new Set(
    entries.filter((entry) => matchesQuery(entryHaystack(entry), query)).map((entry) => entry.key),
  )
  const groupKeys = new Set<string>()
  const keptGroups = new Set<string>()
  for (const entry of entries) {
    if (entry.kind === "folder-group") {
      groupKeys.add(entry.key)
      if (directMatches.has(entry.key)) {
        keptGroups.add(entry.key)
      }
    }
    if (entry.kind === "folder" && directMatches.has(entry.key)) {
      keptGroups.add(entry.parentKey)
    }
  }
  return entries.filter((entry) => {
    if (entry.kind === "folder-group") {
      return keptGroups.has(entry.key)
    }
    if (entry.kind === "folder") {
      return groupKeys.has(entry.parentKey)
        ? keptGroups.has(entry.parentKey)
        : directMatches.has(entry.key)
    }
    return directMatches.has(entry.key)
  })
}

const visibleSettingsEntries = (
  entries: readonly SettingsEntry[],
  collapsedAccounts: ReadonlySet<string>,
  query: string,
): readonly SettingsEntry[] => {
  if (queryTerms(query).length > 0) {
    return entries
  }
  return entries.filter(
    (entry) => entry.kind !== "folder" || !collapsedAccounts.has(entry.accountId),
  )
}

const resolveSelectionKey = (
  current: string | undefined,
  visible: readonly SettingsEntry[],
  all: readonly SettingsEntry[],
): string | undefined => {
  if (current !== undefined && visible.some((entry) => entry.key === current)) {
    return current
  }
  const match = all.find((entry) => entry.key === current)
  if (match?.kind === "folder" && visible.some((entry) => entry.key === match.parentKey)) {
    return match.parentKey
  }
  return visible[0]?.key
}

const groupSettingsEntries = (entries: readonly SettingsEntry[]): readonly SettingsGroup[] =>
  sectionOrder.flatMap((section) => {
    const group = entries.filter((entry) => entry.section === section)
    return group.length === 0 ? [] : [{ section, entries: group }]
  })

export {
  buildSettingsEntries,
  filterSettingsEntries,
  groupSettingsEntries,
  resolveSelectionKey,
  visibleSettingsEntries,
  type SettingsEntriesInput,
  type SettingsEntry,
  type SettingsGroup,
  type SettingsSection,
}
