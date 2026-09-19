import type { KeyEvent } from "@opentui/core"
import type { AccountConfig } from "@vingroto/core/config/schema"

import type { useAccountOrder } from "@/components/settings/use-account-order"
import type { useAccountProfile } from "@/components/settings/use-account-profile"

import { editFields, securityLabel } from "@/components/setup/form-model"

interface SettingsRowBase {
  readonly key: string
  readonly save?: () => void
}

type SettingsRow =
  | (SettingsRowBase & {
      readonly kind: "heading"
      readonly title: () => string
      readonly email: string
      readonly editKey: string
      readonly pending: () => boolean
      readonly reorder: (delta: number) => void
    })
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

interface SettingsBlock {
  readonly key: string
  readonly title?: string
  readonly note?: string
  readonly rows: readonly SettingsRow[]
}

interface SettingsSection {
  readonly key: string
  readonly title: string
  readonly blocks: readonly SettingsBlock[]
}

interface AccountSectionInput {
  readonly accounts: () => readonly AccountConfig[]
  readonly accountOrder: ReturnType<typeof useAccountOrder>
  readonly accountProfile: ReturnType<typeof useAccountProfile>
  readonly onAddAccount: () => void
}

const settingsRowId = (key: string) => `settings-row-${key.replaceAll(/[^a-zA-Z0-9_-]/gu, "-")}`

const accountRows = (
  account: AccountConfig,
  input: AccountSectionInput,
): readonly SettingsRow[] => {
  const save = () => {
    input.accountProfile.save(account.id)
  }
  const rows: SettingsRow[] = [
    {
      kind: "heading",
      key: `account:${account.id}`,
      title: () => input.accountProfile.value(account.id, "label"),
      email: account.email,
      editKey: `account:${account.id}:label`,
      pending: () => input.accountProfile.busy(account.id),
      reorder: (delta) => {
        input.accountOrder.move(account.id, delta)
      },
      save,
    },
  ]
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
  return rows
}

const buildAccountSection = (input: AccountSectionInput): SettingsSection => {
  const blocks: readonly SettingsBlock[] = input.accounts().map((account) => {
    return { key: `account:${account.id}`, rows: accountRows(account, input) }
  })
  return {
    key: "accounts",
    title: "Accounts",
    blocks: [
      ...blocks,
      {
        key: "add-account",
        rows: [
          {
            kind: "action",
            key: "add-account",
            label: "+ Add account",
            run: input.onAddAccount,
          },
        ],
      },
    ],
  }
}

export {
  buildAccountSection,
  settingsRowId,
  type SettingsBlock,
  type SettingsRow,
  type SettingsSection,
}
