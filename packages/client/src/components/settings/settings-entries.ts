import type { AccountConfig, SyncConfig } from "@vingroto/core/config/schema"
import type { AccountId, MailboxId } from "@vingroto/core/ids"
import type { Mailbox } from "@vingroto/core/protocol/mail"

type SettingsSection = "Accounts" | "Mailboxes" | "Sync"

interface SettingsEntryBase {
  readonly key: string
  readonly section: SettingsSection
  readonly title: string
  readonly subtitle: string
}

type SettingsEntry =
  | (SettingsEntryBase & { readonly kind: "add-account" })
  | (SettingsEntryBase & { readonly kind: "account"; readonly accountId: AccountId })
  | (SettingsEntryBase & { readonly kind: "mailbox-group"; readonly accountId: AccountId })
  | (SettingsEntryBase & {
      readonly kind: "mailbox"
      readonly mailboxId: MailboxId
      readonly accountId: AccountId
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
  readonly mailboxes: readonly Mailbox[]
  readonly sync: SyncConfig
}

const sectionOrder: readonly SettingsSection[] = ["Accounts", "Mailboxes", "Sync"]

const mailboxGroupKey = (accountId: AccountId) => `mailboxes:${accountId}`

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
      kind: "mailbox-group",
      key: mailboxGroupKey(account.id),
      section: "Mailboxes",
      title: account.label,
      subtitle: `${account.email} · ${String(count)} ${count === 1 ? "mailbox" : "mailboxes"}`,
      accountId: account.id,
    })
    for (const mailbox of mailboxes) {
      entries.push({
        kind: "mailbox",
        key: `mailbox:${mailbox.id}`,
        section: "Mailboxes",
        title: mailbox.name,
        subtitle: mailbox.path,
        mailboxId: mailbox.id,
        accountId: account.id,
        parentKey: mailboxGroupKey(account.id),
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

const visibleSettingsEntries = (
  entries: readonly SettingsEntry[],
  collapsedAccounts: ReadonlySet<AccountId>,
): readonly SettingsEntry[] =>
  entries.filter((entry) => entry.kind !== "mailbox" || !collapsedAccounts.has(entry.accountId))

const resolveSelectionKey = (
  current: string | undefined,
  visible: readonly SettingsEntry[],
  all: readonly SettingsEntry[],
): string | undefined => {
  if (current !== undefined && visible.some((entry) => entry.key === current)) {
    return current
  }
  const match = all.find((entry) => entry.key === current)
  if (match?.kind === "mailbox" && visible.some((entry) => entry.key === match.parentKey)) {
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
  groupSettingsEntries,
  resolveSelectionKey,
  visibleSettingsEntries,
  type SettingsEntriesInput,
  type SettingsEntry,
  type SettingsGroup,
  type SettingsSection,
}
