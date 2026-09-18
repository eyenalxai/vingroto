import type { KeyEvent } from "@opentui/core"
import type { AccountConfig, SyncConfig } from "@vingroto/core/config/schema"
import type { AccountId, MailboxId } from "@vingroto/core/ids"
import type { Mailbox, MailboxCounts } from "@vingroto/core/protocol/mail"

import { useKeyboard, useRenderer } from "@opentui/solid"
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"

import { useRuntime } from "@/components/runtime-provider"
import { SettingsDetail } from "@/components/settings/settings-detail"
import {
  buildSettingsEntries,
  groupSettingsEntries,
  resolveSelectionKey,
  visibleSettingsEntries,
} from "@/components/settings/settings-entries"
import { SettingsNav } from "@/components/settings/settings-nav"
import { useAccountProfile } from "@/components/settings/use-account-profile"
import { useMailboxMute } from "@/components/settings/use-mailbox-mute"
import { useSyncProfile } from "@/components/settings/use-sync-profile"
import { useTheme } from "@/components/theme-provider"

interface SettingsScreenProps {
  readonly accounts: readonly AccountConfig[]
  readonly mailboxes: readonly Mailbox[]
  readonly counts: ReadonlyMap<MailboxId, MailboxCounts>
  readonly sync: SyncConfig
  readonly onAddAccount: () => void
  readonly onClose: () => void
  readonly onAccountSaved: (account: AccountConfig) => void
  readonly onMailboxChanged: () => void
  readonly onSyncSaved: () => void
  readonly onDisconnected: (message: string) => void
}

const SettingsScreen = (props: SettingsScreenProps) => {
  const runtime = useRuntime()
  const renderer = useRenderer()
  const theme = useTheme()
  const [zone, setZone] = createSignal<"nav" | "detail">("nav")
  const [status, setStatus] = createSignal("")
  const [collapsedMailboxes, setCollapsedMailboxes] = createSignal(new Set<AccountId>())
  const [selectedKey, setSelectedKey] = createSignal<string | undefined>(
    props.accounts[0] === undefined ? "add-account" : `account:${props.accounts[0].id}`,
  )

  const entries = createMemo(() =>
    buildSettingsEntries({
      accounts: props.accounts,
      mailboxes: props.mailboxes,
      sync: props.sync,
    }),
  )
  const visible = createMemo(() => visibleSettingsEntries(entries(), collapsedMailboxes()))
  const groups = createMemo(() => groupSettingsEntries(visible()))
  const mailboxMute = useMailboxMute({
    runtime,
    onStatus: (message) => {
      setStatus(message)
    },
    onChanged: props.onMailboxChanged,
    onDisconnected: props.onDisconnected,
  })
  const mutingAccounts = createMemo(() => {
    const muted = props.mailboxes.filter((mailbox) => mailboxMute.mutingIds().has(mailbox.id))
    return new Set(muted.map((mailbox) => mailbox.account_id))
  })
  const selectedEntry = createMemo(() => visible().find((entry) => entry.key === selectedKey()))

  createEffect(() => {
    setSelectedKey((current) => resolveSelectionKey(current, visible(), entries()))
  })

  createEffect(() => {
    if (selectedEntry()?.kind === "mailbox") {
      setZone("nav")
    }
  })

  const selectedAccount = createMemo(() => {
    const entry = selectedEntry()
    return entry?.kind === "account"
      ? props.accounts.find((account) => account.id === entry.accountId)
      : undefined
  })

  const selectedMailboxEntry = createMemo(() => {
    const entry = selectedEntry()
    return entry?.kind === "mailbox" ? entry : undefined
  })

  const selectedMailbox = createMemo(() => {
    const entry = selectedMailboxEntry()
    return entry === undefined
      ? undefined
      : props.mailboxes.find((mailbox) => mailbox.id === entry.mailboxId)
  })

  const selectedAccountLabel = createMemo(() => {
    const entry = selectedMailboxEntry()
    if (entry === undefined) {
      return ""
    }
    return (
      props.accounts.find((account) => account.id === entry.accountId)?.label ?? entry.accountId
    )
  })

  const accountProfile = useAccountProfile({
    runtime,
    account: selectedAccount,
    active: () => zone() === "detail",
    onSaved: (account) => {
      setStatus(`account ${account.label} saved`)
      props.onAccountSaved(account)
    },
    onDisconnected: props.onDisconnected,
  })

  onCleanup(accountProfile.dispose)

  const syncProfile = useSyncProfile({
    runtime,
    sync: () => props.sync,
    onSaved: () => {
      setStatus("sync settings saved")
      props.onSyncSaved()
    },
    onDisconnected: props.onDisconnected,
  })

  const toggleGroup = (accountId: AccountId) => {
    setCollapsedMailboxes((current) => {
      const next = new Set(current)
      if (next.has(accountId)) {
        next.delete(accountId)
      } else {
        next.add(accountId)
      }
      return next
    })
  }

  const moveSelection = (delta: number) => {
    const rows = visible()
    const index = rows.findIndex((entry) => entry.key === selectedKey())
    const clamped = Math.min(Math.max(index === -1 ? 0 : index + delta, 0), rows.length - 1)
    const next = rows[clamped]
    if (next !== undefined) {
      setSelectedKey(next.key)
    }
  }

  const activateEntry = (key: string) => {
    setSelectedKey(key)
    const entry = visible().find((candidate) => candidate.key === key)
    if (entry === undefined) {
      return
    }
    if (entry.kind === "add-account") {
      props.onAddAccount()
      return
    }
    if (entry.kind === "mailbox-group") {
      toggleGroup(entry.accountId)
      return
    }
    if (entry.kind === "mailbox") {
      mailboxMute.toggleMute(entry.mailboxId, entry.name, entry.muted)
      return
    }
    setZone("detail")
  }

  const handleNavKey = (event: KeyEvent): boolean => {
    if (event.name === "down") {
      event.preventDefault()
      moveSelection(1)
      return true
    }
    if (event.name === "up") {
      event.preventDefault()
      moveSelection(-1)
      return true
    }
    if (event.name === "space") {
      const entry = selectedEntry()
      if (entry?.kind === "mailbox-group") {
        event.preventDefault()
        toggleGroup(entry.accountId)
      } else if (entry?.kind === "mailbox") {
        event.preventDefault()
        mailboxMute.toggleMute(entry.mailboxId, entry.name, entry.muted)
      }
      return true
    }
    if (event.name === "tab" || event.name === "return") {
      event.preventDefault()
      const entry = selectedEntry()
      if (entry !== undefined && (event.name === "return" || entry.kind !== "add-account")) {
        activateEntry(entry.key)
      }
      return true
    }
    if (event.name === "escape") {
      event.preventDefault()
      props.onClose()
      return true
    }
    return false
  }

  const handleDetailKey = (event: KeyEvent): boolean => {
    if (event.name === "escape" || (event.name === "tab" && event.shift)) {
      event.preventDefault()
      setZone("nav")
      return true
    }
    const entry = selectedEntry()
    if (entry?.kind === "account") {
      if (accountProfile.handleKey(event)) {
        event.preventDefault()
      }
      return true
    }
    if (entry?.kind === "sync") {
      if (syncProfile.handleKey(event)) {
        event.preventDefault()
      }
      return true
    }
    return false
  }

  useKeyboard((event) => {
    if (event.ctrl && event.name === "c") {
      event.preventDefault()
      renderer.destroy()
      return
    }
    if (zone() === "nav") {
      handleNavKey(event)
      return
    }
    handleDetailKey(event)
  })

  return (
    <box flexGrow={1} flexDirection="column">
      <box flexGrow={1} flexDirection="row" gap={1}>
        <SettingsNav
          groups={groups()}
          collapsed={collapsedMailboxes()}
          mutingIds={mailboxMute.mutingIds()}
          mutingAccounts={mutingAccounts()}
          selectedKey={selectedKey()}
          onSelect={(key) => {
            setSelectedKey(key)
          }}
          onActivate={activateEntry}
        />
        <SettingsDetail
          entry={selectedEntry()}
          zone={zone()}
          account={selectedAccount()}
          mailbox={selectedMailbox()}
          accountLabel={selectedAccountLabel()}
          counts={props.counts}
          accountProfile={accountProfile}
          syncProfile={syncProfile}
          mutingIds={mailboxMute.mutingIds()}
        />
      </box>
      <box flexShrink={0} paddingLeft={2} paddingRight={2}>
        <text fg={theme.muted} wrapMode="none" truncate>
          {status()}
        </text>
      </box>
    </box>
  )
}

export { SettingsScreen, type SettingsScreenProps }
