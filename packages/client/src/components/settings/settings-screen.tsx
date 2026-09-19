import type {
  AccountConfig,
  NotificationsConfig,
  SendConfig,
  SyncConfig,
} from "@vingroto/core/config/schema"
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
import { useAccountOrder } from "@/components/settings/use-account-order"
import { useAccountProfile } from "@/components/settings/use-account-profile"
import { useNotificationsSetting } from "@/components/settings/use-notifications-setting"
import { useSendProfile } from "@/components/settings/use-send-profile"
import { useSettingsKeys } from "@/components/settings/use-settings-keys"
import { useSettingsSelection } from "@/components/settings/use-settings-selection"
import { useSyncProfile } from "@/components/settings/use-sync-profile"
import { useTheme } from "@/components/theme-provider"
import { useMailboxMute } from "@/components/use-mailbox-mute"

interface SettingsScreenProps {
  readonly accounts: readonly AccountConfig[]
  readonly mailboxes: readonly Mailbox[]
  readonly counts: ReadonlyMap<MailboxId, MailboxCounts>
  readonly sync: SyncConfig
  readonly send: SendConfig
  readonly notifications: NotificationsConfig
  readonly onAddAccount: () => void
  readonly onClose: () => void
  readonly onAccountSaved: (account: AccountConfig) => void
  readonly onMailboxChanged: () => void
  readonly onSyncSaved: () => void
  readonly onSendSaved: () => void
  readonly onNotificationsSaved: () => void
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

  const accountOrder = useAccountOrder({
    runtime,
    accounts: () => props.accounts,
    onStatus: (message) => {
      setStatus(message)
    },
    onDisconnected: props.onDisconnected,
  })
  const orderedAccounts = accountOrder.accounts
  const entries = createMemo(() =>
    buildSettingsEntries({
      accounts: orderedAccounts(),
      mailboxes: props.mailboxes,
      sync: props.sync,
      send: props.send,
      notifications: props.notifications,
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

  const { selectedAccount, selectedAccountLabel, selectedMailbox } = useSettingsSelection({
    entry: selectedEntry,
    accounts: orderedAccounts,
    mailboxes: () => props.mailboxes,
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

  const sendProfile = useSendProfile({
    runtime,
    send: () => props.send,
    onSaved: () => {
      setStatus("sending settings saved")
      props.onSendSaved()
    },
    onDisconnected: props.onDisconnected,
  })

  const notificationsSetting = useNotificationsSetting({
    runtime,
    onStatus: (message) => {
      setStatus(message)
    },
    onSaved: props.onNotificationsSaved,
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

  const settingsKeys = useSettingsKeys({
    visible,
    selectedEntry,
    selectedKey,
    setSelectedKey,
    zone,
    setZone,
    accountOrder,
    accountProfile,
    syncProfile,
    sendProfile,
    notificationsSetting,
    mailboxMute,
    notifications: () => props.notifications,
    onToggleGroup: toggleGroup,
    onAddAccount: props.onAddAccount,
    onClose: props.onClose,
  })

  useKeyboard((event) => {
    if (event.ctrl && event.name === "c") {
      event.preventDefault()
      renderer.destroy()
      return
    }
    settingsKeys.handleKey(event)
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
          onActivate={settingsKeys.activateEntry}
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
          sendProfile={sendProfile}
          mutingIds={mailboxMute.mutingIds()}
          notifications={props.notifications}
          notificationsSaving={notificationsSetting.saving()}
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
