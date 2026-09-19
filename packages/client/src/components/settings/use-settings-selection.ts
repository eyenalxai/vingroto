import type { AccountConfig } from "@vingroto/core/config/schema"
import type { Mailbox } from "@vingroto/core/protocol/mail"

import { createMemo } from "solid-js"

import type { SettingsEntry } from "@/components/settings/settings-entries"

interface SettingsSelectionOptions {
  readonly entry: () => SettingsEntry | undefined
  readonly accounts: () => readonly AccountConfig[]
  readonly mailboxes: () => readonly Mailbox[]
}

const useSettingsSelection = (options: SettingsSelectionOptions) => {
  const selectedAccount = createMemo(() => {
    const entry = options.entry()
    return entry?.kind === "account"
      ? options.accounts().find((account) => account.id === entry.accountId)
      : undefined
  })

  const selectedMailboxEntry = createMemo(() => {
    const entry = options.entry()
    return entry?.kind === "mailbox" ? entry : undefined
  })

  const selectedMailbox = createMemo(() => {
    const entry = selectedMailboxEntry()
    return entry === undefined
      ? undefined
      : options.mailboxes().find((mailbox) => mailbox.id === entry.mailboxId)
  })

  const selectedAccountLabel = createMemo(() => {
    const entry = selectedMailboxEntry()
    if (entry === undefined) {
      return ""
    }
    return (
      options.accounts().find((account) => account.id === entry.accountId)?.label ?? entry.accountId
    )
  })

  return { selectedAccount, selectedAccountLabel, selectedMailbox, selectedMailboxEntry }
}

export { useSettingsSelection, type SettingsSelectionOptions }
