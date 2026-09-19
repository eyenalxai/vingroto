import type {
  AccountConfig,
  EditorConfig,
  NotificationsConfig,
  SendConfig,
  SyncConfig,
} from "@vingroto/core/config/schema"
import type { MailboxId } from "@vingroto/core/ids"
import type { Mailbox, MailboxCounts } from "@vingroto/core/protocol/mail"

import { useTerminalDimensions } from "@opentui/solid"
import { Effect } from "effect"
import { Show, createMemo, createSignal, onCleanup } from "solid-js"

import { useRuntime } from "@/components/runtime-provider"
import {
  resolveSettingsLayout,
  settingsSectionsPaneWidth,
} from "@/components/settings/settings-layout"
import { SettingsContentPane, SettingsSectionsPane } from "@/components/settings/settings-panes"
import { buildAccountSection } from "@/components/settings/settings-rows"
import {
  buildComposerSection,
  buildMailboxSection,
  buildNotificationsSection,
  buildSendingSection,
  buildSyncSection,
} from "@/components/settings/settings-section-builders"
import { useAccountOrder } from "@/components/settings/use-account-order"
import { useAccountProfile } from "@/components/settings/use-account-profile"
import { useArmedDiscard } from "@/components/settings/use-armed-discard"
import { useEditorSetting } from "@/components/settings/use-editor-setting"
import { useNotificationsSetting } from "@/components/settings/use-notifications-setting"
import { useSendProfile } from "@/components/settings/use-send-profile"
import { useSettingsExpansion } from "@/components/settings/use-settings-expansion"
import { useSettingsInput } from "@/components/settings/use-settings-input"
import { useSyncProfile } from "@/components/settings/use-sync-profile"
import { StatusBar } from "@/components/status-bar"
import { useMailboxMute } from "@/components/use-mailbox-mute"
import { describeSystemEditor } from "@/lib/external"

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
  const dimensions = useTerminalDimensions()
  const expansion = useSettingsExpansion()
  const discard = useArmedDiscard()
  const [status, setStatus] = createSignal("")
  const [statusError, setStatusError] = createSignal(false)
  const [systemEditor, setSystemEditor] = createSignal("vi")

  runtime.runFork(
    describeSystemEditor.pipe(
      Effect.tap((label) =>
        Effect.sync(() => {
          setSystemEditor(label)
        }),
      ),
    ),
  )

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
      discard.disarm()
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
      discard.disarm()
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
      discard.disarm()
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
      discard.disarm()
      props.onEditorSaved()
    },
    onStatus: report,
    onDisconnected: props.onDisconnected,
  })
  const notificationsSetting = useNotificationsSetting({
    runtime,
    notifications: () => props.notifications,
    onStatus: report,
    onSaved: () => {
      discard.disarm()
      props.onNotificationsSaved()
    },
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
      expansion,
      onAddAccount: props.onAddAccount,
    }),
  )
  const mailboxSection = createMemo(() =>
    buildMailboxSection({
      accounts: () => accountOrder.accounts(),
      mailboxes: () => props.mailboxes,
      counts: () => props.counts,
      mailboxMute,
      expansion,
    }),
  )
  const composerSection = createMemo(() => buildComposerSection({ editorSetting, systemEditor }))
  const sendingSection = createMemo(() => buildSendingSection({ sendProfile }))
  const syncSection = createMemo(() => buildSyncSection({ syncProfile }))
  const notificationsSection = createMemo(() => buildNotificationsSection({ notificationsSetting }))
  const sections = createMemo(() => [
    accountSection(),
    mailboxSection(),
    composerSection(),
    sendingSection(),
    syncSection(),
    notificationsSection(),
  ])

  const layout = createMemo(() => resolveSettingsLayout(dimensions().width))
  const pending = () =>
    accountProfile.busyAny() ||
    syncProfile.busy() ||
    sendProfile.busy() ||
    editorSetting.busy() ||
    notificationsSetting.saving() ||
    mailboxMute.mutingIds().size > 0
  const dirty = () =>
    accountProfile.dirtyAny() ||
    editorSetting.dirty() ||
    syncProfile.dirty() ||
    sendProfile.dirty() ||
    notificationsSetting.dirty()

  const settingsInput = useSettingsInput({
    sections,
    layout,
    dirty,
    discard,
    onClose: props.onClose,
  })

  const sectionsFocused = () => settingsInput.focus() === "sections"
  const contentFocused = () => settingsInput.focus() === "content"

  return (
    <box flexGrow={1} flexDirection="column">
      <box flexGrow={1} flexDirection="row" gap={1}>
        <Show when={layout() === "two" || sectionsFocused()}>
          <SettingsSectionsPane
            width={layout() === "two" ? settingsSectionsPaneWidth : "100%"}
            sections={sections}
            selectedKey={settingsInput.sectionKey}
            focused={sectionsFocused}
            onSelect={settingsInput.selectSection}
          />
        </Show>
        <Show when={layout() === "two" || contentFocused()}>
          <SettingsContentPane
            title={`settings · ${settingsInput.section()?.title.toLowerCase() ?? "sections"}`}
            section={settingsInput.section}
            selectedKey={settingsInput.selectedKey}
            editingKey={settingsInput.editKey}
            focused={contentFocused}
            onSelectGroup={settingsInput.selectGroup}
            onSelectRow={settingsInput.selectRow}
          />
        </Show>
      </box>
      <StatusBar
        message={settingsInput.armed() ? settingsInput.discard() : status()}
        busy={pending()}
        hint={settingsInput.hint()}
        error={!settingsInput.armed() && statusError()}
      />
    </box>
  )
}

export { SettingsScreen, type SettingsScreenProps }
