import type { AccountConfig, SyncConfig } from "@/lib/config/schema"
import type { MailboxRow } from "@/lib/store/mailboxes"

import { matchesQuery } from "@/lib/search"

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
  | (SettingsEntryBase & {
      readonly kind: "folder"
      readonly mailboxId: number
      readonly accountId: string
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
    for (const mailbox of mailboxes) {
      entries.push({
        kind: "folder",
        key: `folder:${mailbox.id}`,
        section: "Folders",
        title: mailbox.name,
        subtitle: `${account.label} · ${mailbox.path}`,
        mailboxId: mailbox.id,
        accountId: account.id,
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

const filterSettingsEntries = (
  entries: readonly SettingsEntry[],
  query: string,
): readonly SettingsEntry[] =>
  entries.filter((entry) =>
    matchesQuery(`${entry.title} ${entry.subtitle} ${entry.section}`, query),
  )

const groupSettingsEntries = (entries: readonly SettingsEntry[]): readonly SettingsGroup[] =>
  sectionOrder.flatMap((section) => {
    const group = entries.filter((entry) => entry.section === section)
    return group.length === 0 ? [] : [{ section, entries: group }]
  })

export {
  buildSettingsEntries,
  filterSettingsEntries,
  groupSettingsEntries,
  type SettingsEntriesInput,
  type SettingsEntry,
  type SettingsGroup,
  type SettingsSection,
}
