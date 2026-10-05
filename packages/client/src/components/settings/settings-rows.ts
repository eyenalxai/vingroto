import type { KeyEvent } from "@opentui/core"
import type { AccountConfig } from "@vingroto/core/config/schema"

import type { useAccountOrder } from "@/components/settings/use-account-order"
import type { useAccountProfile } from "@/components/settings/use-account-profile"
import type { useAccountReauthorize } from "@/components/settings/use-account-reauthorize"
import type { SettingsExpansion } from "@/components/settings/use-settings-expansion"
import type { FieldId } from "@/components/setup/form-model"

import { authLabel } from "@/components/setup/credential-fields"
import { editFieldsFor, securityLabel } from "@/components/setup/form-model"

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
      readonly hint?: string | undefined
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
  readonly accountReauthorize: ReturnType<typeof useAccountReauthorize>
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

interface AccountRowsPort {
  readonly value: (field: FieldId) => string
  readonly applyKey: (event: KeyEvent) => boolean
  readonly restorePassword: (password: string) => void
  readonly input: (field: FieldId, next: string) => void
  readonly cycle: (field: FieldId, delta: number) => void
  readonly loading: () => boolean
  readonly save: () => void
  readonly reauthorize: () => void
}

const accountRows = (account: AccountConfig, port: AccountRowsPort): readonly SettingsRow[] => {
  const rows: SettingsRow[] = []
  for (const field of editFieldsFor(account.auth)) {
    const key = `account:${account.id}:${field.id}`
    const value = () => port.value(field.id)
    if (field.kind === "readonly") {
      rows.push({
        kind: "reading",
        key,
        label: field.label,
        value: field.id === "auth" ? () => authLabel(value()) : value,
      })
      continue
    }
    if (field.kind === "security") {
      rows.push({
        kind: "choice",
        key,
        label: field.label,
        value: () => securityLabel(value()),
        cycle: (delta) => {
          port.cycle(field.id, delta)
        },
        save: port.save,
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
          port.cycle(field.id, 1)
        },
        save: port.save,
      })
      continue
    }
    if (field.kind === "secret") {
      rows.push({
        kind: "secret",
        key,
        label: field.label,
        value,
        applyKey: port.applyKey,
        restore: port.restorePassword,
        save: port.save,
      })
      continue
    }
    rows.push({
      kind: "text",
      key,
      label: field.label,
      value,
      input: (next) => {
        port.input(field.id, next)
      },
      placeholder: field.placeholder,
      pending: field.id === "username" ? port.loading : undefined,
      save: port.save,
    })
  }
  if (account.auth === "oauth2") {
    rows.push({
      kind: "action",
      key: `account:${account.id}:reauthorize`,
      label: "Re-authorize",
      hint: "⏎ re-authorize · esc sections",
      run: port.reauthorize,
    })
  }
  return rows
}

const accountGroup = (account: AccountConfig, input: AccountSectionInput): SettingsGroup => {
  const groupKey = `account:${account.id}`
  const save = () => {
    if (input.accountReauthorize.busy(account.id)) {
      return
    }
    input.accountProfile.save(account.id)
  }
  const rows = accountRows(account, {
    value: (field) => input.accountProfile.value(account.id, field),
    applyKey: (event) => input.accountProfile.applyKey(account.id, event),
    restorePassword: (password) => {
      input.accountProfile.restorePassword(account.id, password)
    },
    input: (field, next) => {
      input.accountProfile.input(account.id, field, next)
    },
    cycle: (field, delta) => {
      input.accountProfile.cycle(account.id, field, delta)
    },
    loading: () => input.accountProfile.loading(account.id),
    save,
    reauthorize: () => {
      input.accountReauthorize.reauthorize(account.id)
    },
  })
  return {
    kind: "account",
    key: groupKey,
    title: () => {
      const label = input.accountProfile.value(account.id, "label").trim()
      return label.length === 0 ? account.email : label
    },
    summary: () => account.email,
    dirty: () => input.accountProfile.dirty(account.id),
    pending: () =>
      input.accountProfile.busy(account.id) || input.accountReauthorize.busy(account.id),
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
  accountRows,
  buildAccountSection,
  sectionItems,
  settingsRowId,
  settingsSectionId,
  type AccountRowsPort,
  type SettingsGroup,
  type SettingsItem,
  type SettingsRow,
  type SettingsSection,
}
