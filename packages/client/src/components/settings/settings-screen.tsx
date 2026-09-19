import type { ScrollBoxRenderable } from "@opentui/core"
import type {
  AccountConfig,
  EditorConfig,
  NotificationsConfig,
  SendConfig,
  SyncConfig,
} from "@vingroto/core/config/schema"
import type { MailboxId } from "@vingroto/core/ids"
import type { Mailbox, MailboxCounts } from "@vingroto/core/protocol/mail"

import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"

import { useRuntime } from "@/components/runtime-provider"
import { buildAccountSection, settingsRowId } from "@/components/settings/settings-rows"
import { SettingsSectionView } from "@/components/settings/settings-section"
import {
  buildComposerSection,
  buildMailboxSection,
  buildNotificationsSection,
  buildSendingSection,
  buildSyncSection,
} from "@/components/settings/settings-section-builders"
import { useAccountOrder } from "@/components/settings/use-account-order"
import { useAccountProfile } from "@/components/settings/use-account-profile"
import { useEditorSetting } from "@/components/settings/use-editor-setting"
import { useNotificationsSetting } from "@/components/settings/use-notifications-setting"
import { useSendProfile } from "@/components/settings/use-send-profile"
import { useSettingsInput } from "@/components/settings/use-settings-input"
import { useSyncProfile } from "@/components/settings/use-sync-profile"
import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"
import { useMailboxMute } from "@/components/use-mailbox-mute"

interface SettingsScreenProps {
  readonly accounts: readonly AccountConfig[]
  readonly mailboxes: readonly Mailbox[]
  readonly counts: ReadonlyMap<MailboxId, MailboxCounts>
  readonly sync: SyncConfig
  readonly send: SendConfig
  readonly notifications: NotificationsConfig
  readonly editor: EditorConfig
  readonly onAddAccount: () => void
  readonly onClose: () => void
  readonly onAccountSaved: (account: AccountConfig) => void
  readonly onMailboxChanged: () => void
  readonly onSyncSaved: () => void
  readonly onSendSaved: () => void
  readonly onNotificationsSaved: () => void
  readonly onEditorSaved: () => void
  readonly onDisconnected: (message: string) => void
}

const SettingsScreen = (props: SettingsScreenProps) => {
  const runtime = useRuntime()
  const theme = useTheme()
  const [status, setStatus] = createSignal("")
  const [statusError, setStatusError] = createSignal(false)
  const [selectedKey, setSelectedKey] = createSignal<string>()
  const [editingKey, setEditingKey] = createSignal<string>()
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()

  const report = (message: string, error = false) => {
    setStatus(message)
    setStatusError(error)
  }

  const accountOrder = useAccountOrder({
    runtime,
    accounts: () => props.accounts,
    onStatus: (message) => {
      report(message, true)
    },
    onDisconnected: props.onDisconnected,
  })
  const accountProfile = useAccountProfile({
    runtime,
    accounts: () => accountOrder.accounts(),
    onSaved: (account) => {
      report(`saved ${account.label}`)
      props.onAccountSaved(account)
    },
    onStatus: report,
    onDisconnected: props.onDisconnected,
  })
  const syncProfile = useSyncProfile({
    runtime,
    sync: () => props.sync,
    onSaved: () => {
      report("sync settings saved")
      props.onSyncSaved()
    },
    onStatus: report,
    onDisconnected: props.onDisconnected,
  })
  const sendProfile = useSendProfile({
    runtime,
    send: () => props.send,
    onSaved: () => {
      report("sending settings saved")
      props.onSendSaved()
    },
    onStatus: report,
    onDisconnected: props.onDisconnected,
  })
  const editorSetting = useEditorSetting({
    runtime,
    editor: () => props.editor,
    onSaved: () => {
      props.onEditorSaved()
    },
    onStatus: report,
    onDisconnected: props.onDisconnected,
  })
  const notificationsSetting = useNotificationsSetting({
    runtime,
    onStatus: report,
    onSaved: props.onNotificationsSaved,
    onDisconnected: props.onDisconnected,
  })
  const mailboxMute = useMailboxMute({
    runtime,
    onStatus: report,
    onChanged: props.onMailboxChanged,
    onDisconnected: props.onDisconnected,
  })

  onCleanup(accountProfile.dispose)

  const accountSection = createMemo(() =>
    buildAccountSection({
      accounts: () => accountOrder.accounts(),
      accountOrder,
      accountProfile,
      onAddAccount: props.onAddAccount,
    }),
  )
  const mailboxSection = createMemo(() =>
    buildMailboxSection({
      accounts: () => accountOrder.accounts(),
      mailboxes: () => props.mailboxes,
      counts: () => props.counts,
      mailboxMute,
    }),
  )
  const composerSection = createMemo(() => buildComposerSection({ editorSetting }))
  const sendingSection = createMemo(() => buildSendingSection({ sendProfile }))
  const syncSection = createMemo(() => buildSyncSection({ syncProfile }))
  const notificationsSection = createMemo(() =>
    buildNotificationsSection({
      notifications: () => props.notifications,
      notificationsSetting,
    }),
  )

  const sections = [
    accountSection,
    mailboxSection,
    composerSection,
    sendingSection,
    syncSection,
    notificationsSection,
  ]

  const rows = createMemo(() =>
    sections.flatMap((section) => section().blocks.flatMap((block) => block.rows)),
  )

  const { hint, selectRow } = useSettingsInput({
    rows,
    selectedKey,
    editingKey,
    setSelectedKey,
    setEditingKey,
    onClose: props.onClose,
  })

  createEffect(() => {
    const current = rows()
    setSelectedKey((key) =>
      key !== undefined && current.some((row) => row.key === key) ? key : current[0]?.key,
    )
    setEditingKey((key) =>
      key !== undefined && current.some((row) => row.key === key) ? key : undefined,
    )
  })

  createEffect(() => {
    const box = scrollBox()
    const key = selectedKey()
    if (box !== undefined && key !== undefined && rows().some((row) => row.key === key)) {
      box.scrollChildIntoView(settingsRowId(key))
    }
  })

  const pending = () =>
    accountProfile.busyAny() ||
    syncProfile.busy() ||
    sendProfile.busy() ||
    editorSetting.busy() ||
    notificationsSetting.saving()

  return (
    <box flexGrow={1} flexDirection="column">
      <scrollbox
        ref={(box) => {
          setScrollBox(box)
        }}
        flexGrow={1}
        paddingLeft={2}
        paddingRight={2}
      >
        <For each={sections}>
          {(section) => (
            <SettingsSectionView
              section={section}
              selectedKey={selectedKey}
              editingKey={editingKey}
              onSelect={selectRow}
            />
          )}
        </For>
      </scrollbox>
      <box flexShrink={0} paddingLeft={2} paddingRight={2} paddingTop={1}>
        <Show
          when={pending()}
          fallback={<text fg={statusError() ? theme.error : theme.muted}>{status()}</text>}
        >
          <Spinner label={status()} />
        </Show>
      </box>
      <box flexShrink={0} paddingLeft={2} paddingRight={2}>
        <text fg={theme.muted}>{hint()}</text>
      </box>
    </box>
  )
}

export { SettingsScreen, type SettingsScreenProps }
