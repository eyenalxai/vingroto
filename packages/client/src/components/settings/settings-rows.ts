import type { KeyEvent } from "@opentui/core"
import type { AccountConfig } from "@vingroto/core/config/schema"

import type { useAccountOrder } from "@/components/settings/use-account-order"
import type { useAccountProfile } from "@/components/settings/use-account-profile"
import type { SettingsExpansion } from "@/components/settings/use-settings-expansion"

import { editFields, securityLabel } from "@/components/setup/form-model"

interface SettingsRowBase {
  readonly key: string
  readonly save?: () => void
}

type SettingsRow =
  | (SettingsRowBase & {
      readonly kind: "text"
      readonly label: string
      readonly value: () => string
      readonly input: (value: string) => void
      readonly placeholder?: string | undefined
      readonly pending?: (() => boolean) | undefined
    })
  | (SettingsRowBase & {
      readonly kind: "secret"
      readonly label: string
      readonly value: () => string
      readonly applyKey: (event: KeyEvent) => boolean
      readonly restore: (value: string) => void
    })
  | (SettingsRowBase & {
      readonly kind: "choice"
      readonly label: string
      readonly value: () => string
      readonly cycle: (delta: number) => void
    })
  | (SettingsRowBase & {
      readonly kind: "toggle"
      readonly label: string
      readonly value: () => boolean
      readonly toggle: () => void
      readonly pending?: (() => boolean) | undefined
    })
  | (SettingsRowBase & {
      readonly kind: "reading"
      readonly label: string
      readonly value: () => string
    })
  | (SettingsRowBase & {
      readonly kind: "action"
      readonly label: string
      readonly run: () => void
    })
  | (SettingsRowBase & {
      readonly kind: "mailbox"
      readonly name: string
      readonly path: string
      readonly unread: () => number
      readonly muted: boolean
      readonly pending: () => boolean
      readonly toggle: () => void
    })

interface SettingsGroup {
  readonly kind: "account" | "mailboxes"
  readonly key: string
  readonly title: () => string
  readonly summary: () => string
  readonly note?: string
  readonly dirty?: () => boolean
  readonly pending?: () => boolean
  readonly expanded: () => boolean
  readonly toggle: () => void
  readonly reorder?: (delta: number) => void
  readonly save?: () => void
  readonly rows: readonly SettingsRow[]
}

interface SettingsSection {
  readonly key: string
  readonly title: string
  readonly groups: readonly SettingsGroup[]
  readonly rows: readonly SettingsRow[]
  readonly dirty?: () => boolean
}

type SettingsItem =
  | { readonly kind: "group"; readonly key: string; readonly group: SettingsGroup }
  | { readonly kind: "row"; readonly key: string; readonly row: SettingsRow }

interface AccountSectionInput {
  readonly accounts: () => readonly AccountConfig[]
  readonly accountOrder: ReturnType<typeof useAccountOrder>
  readonly accountProfile: ReturnType<typeof useAccountProfile>
  readonly expansion: SettingsExpansion
  readonly onAddAccount: () => void
}

const settingsRowId = (key: string) => `settings-row-${key.replaceAll(/[^a-zA-Z0-9_-]/gu, "-")}`

const settingsSectionId = (key: string) => `settings-section-${key}`

const sectionItems = (section: SettingsSection): readonly SettingsItem[] => {
  const items: SettingsItem[] = []
  for (const group of section.groups) {
    items.push({ kind: "group", key: group.key, group })
    if (group.expanded()) {
      for (const row of group.rows) {
        items.push({ kind: "row", key: row.key, row })
      }
    }
  }
  for (const row of section.rows) {
    items.push({ kind: "row", key: row.key, row })
  }
  return items
}

const accountGroup = (account: AccountConfig, input: AccountSectionInput): SettingsGroup => {
  const groupKey = `account:${account.id}`
  const save = () => {
    input.accountProfile.save(account.id)
  }
  const rows: SettingsRow[] = []
  for (const field of editFields) {
    const key = `account:${account.id}:${field.id}`
    const value = () => input.accountProfile.value(account.id, field.id)
    if (field.kind === "readonly") {
      rows.push({ kind: "reading", key, label: field.label, value })
      continue
    }
    if (field.kind === "security") {
      rows.push({
        kind: "choice",
        key,
        label: field.label,
        value: () => securityLabel(value()),
        cycle: (delta) => {
          input.accountProfile.cycle(account.id, field.id, delta)
        },
        save,
      })
      continue
    }
    if (field.kind === "boolean") {
      rows.push({
        kind: "toggle",
        key,
        label: field.label,
        value: () => value() === "yes",
        toggle: () => {
          input.accountProfile.cycle(account.id, field.id, 1)
        },
        save,
      })
      continue
    }
    if (field.kind === "secret") {
      rows.push({
        kind: "secret",
        key,
        label: field.label,
        value,
        applyKey: (event) => input.accountProfile.applyKey(account.id, event),
        restore: (password) => {
          input.accountProfile.restorePassword(account.id, password)
        },
        save,
      })
      continue
    }
    rows.push({
      kind: "text",
      key,
      label: field.label,
      value,
      input: (next) => {
        input.accountProfile.input(account.id, field.id, next)
      },
      placeholder: field.placeholder,
      pending: field.id === "username" ? () => input.accountProfile.loading(account.id) : undefined,
      save,
    })
  }
  return {
    kind: "account",
    key: groupKey,
    title: () => {
      const label = input.accountProfile.value(account.id, "label").trim()
      return label.length === 0 ? account.email : label
    },
    summary: () => account.email,
    dirty: () => input.accountProfile.dirty(account.id),
    pending: () => input.accountProfile.busy(account.id),
    expanded: () => input.expansion.isExpanded(groupKey),
    toggle: () => {
      input.expansion.toggle(groupKey)
    },
    reorder: (delta) => {
      input.accountOrder.move(account.id, delta)
    },
    save,
    rows,
  }
}

const buildAccountSection = (input: AccountSectionInput): SettingsSection => ({
  key: "accounts",
  title: "Accounts",
  dirty: () => input.accountProfile.dirtyAny(),
  groups: input.accounts().map((account) => accountGroup(account, input)),
  rows: [
    {
      kind: "action",
      key: "add-account",
      label: "+ Add account",
      run: input.onAddAccount,
    },
  ],
})

export {
  buildAccountSection,
  sectionItems,
  settingsRowId,
  settingsSectionId,
  type SettingsGroup,
  type SettingsItem,
  type SettingsRow,
  type SettingsSection,
}
