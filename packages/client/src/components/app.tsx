import type { AccountConfig, AppConfig } from "@vingroto/core/config/schema"
import type { MailboxId } from "@vingroto/core/ids"

import { useRenderer } from "@opentui/solid"
import { Show, createEffect, createMemo, createSignal } from "solid-js"

import type { Pane } from "@/components/pane-layout"
import type { MoveTargetsResult } from "@/lib/mail/move"

import { ComposerScreen } from "@/components/composer/composer-screen"
import { MailWorkspace } from "@/components/mail-workspace"
import { MovePicker } from "@/components/move-picker"
import { useRuntime } from "@/components/runtime-provider"
import { createSettingsActions } from "@/components/settings/settings-actions"
import { SettingsScreen } from "@/components/settings/settings-screen"
import { AccountSetup } from "@/components/setup/account-setup"
import { StartupScreen } from "@/components/startup-screen"
import { useComposeFlow } from "@/components/use-compose-flow"
import { useDaemonStatus } from "@/components/use-daemon-status"
import { useMailStore } from "@/components/use-mail-store"
import { useMailSyncWindow } from "@/components/use-mail-sync"
import { useNewMailNotifications } from "@/components/use-new-mail-notifications"
import { resolveMoveTargets } from "@/lib/mail/move"
import { clearSelection, isCollapsedSelection } from "@/lib/selection"

type MoveTargets = Extract<MoveTargetsResult, { _tag: "ok" }>

const App = () => {
  const runtime = useRuntime()
  const renderer = useRenderer()
  const daemon = useDaemonStatus(runtime)
  const [status, setStatus] = createSignal("ready")
  const [addingAccount, setAddingAccount] = createSignal(false)
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const [moving, setMoving] = createSignal<MoveTargets | undefined>()
  const [pane, setPane] = createSignal<Pane>("mailbox")

  const appConfig = createMemo((): AppConfig | undefined => {
    const value = daemon.status()
    return value !== undefined && value.config._tag === "ok" ? value.config.config : undefined
  })

  const accounts = createMemo<readonly AccountConfig[]>(() => appConfig()?.accounts ?? [])

  const notifications = useNewMailNotifications({
    runtime,
    accounts,
    enabled: () => appConfig()?.notifications.enabled ?? false,
  })

  const configError = createMemo((): string | undefined => {
    const value = daemon.status()
    return value !== undefined && value.config._tag === "error" ? value.config.message : undefined
  })

  const needsSetup = createMemo(() => daemon.status()?.config._tag === "empty")
  const connected = createMemo((prior: boolean) => prior || daemon.status() !== undefined, false)

  const store = useMailStore({
    config: appConfig,
    connected: () => connected(),
    onConfigChanged: () => {
      runtime.runFork(daemon.refresh)
    },
    onDisconnected: (message: string) => {
      daemon.retry(message)
    },
    onNewMail: notifications.notify,
    onStatus: (value: string) => {
      setStatus(value)
    },
    runtime,
  })

  const flow = useComposeFlow({
    accounts,
    bodyState: store.body,
    detail: store.detail,
    onStatus: (message: string) => {
      setStatus(message)
    },
    selectedMessageId: store.selectedMessageId,
  })

  const mainVisible = createMemo(
    () =>
      connected() &&
      configError() === undefined &&
      !needsSetup() &&
      !addingAccount() &&
      !settingsOpen() &&
      moving() === undefined &&
      !flow.active(),
  )
  const setupVisible = createMemo(
    () =>
      connected() &&
      configError() === undefined &&
      !settingsOpen() &&
      (needsSetup() || addingAccount()),
  )
  const settingsVisible = createMemo(
    () => settingsOpen() && appConfig() !== undefined && !addingAccount(),
  )
  const composerVisible = createMemo(
    () => flow.composing() !== undefined && appConfig() !== undefined,
  )

  const sync = useMailSyncWindow({
    runtime,
    config: appConfig,
    onStatus: (value: string) => {
      setStatus(value)
    },
    onDisconnected: (message: string) => {
      daemon.retry(message)
    },
    onFinished: store.loadMailboxData,
  })

  const settings = createSettingsActions({
    runtime,
    refresh: daemon.refresh,
    onRefreshed: store.loadMailboxData,
    onStatus: (value: string) => {
      setStatus(value)
    },
    onAccountAdded: () => {
      setAddingAccount(false)
    },
    syncWindow: sync.syncWindow,
  })

  const beginAddAccount = () => {
    setSettingsOpen(false)
    setAddingAccount(true)
  }

  const beginMove = () => {
    const result = resolveMoveTargets(store.targets(), accounts(), store.visibleMailboxes())
    if (result._tag === "error") {
      setStatus(result.message)
      return
    }
    setMoving(result)
  }

  const autoSyncedMailboxes = new Set<MailboxId>()

  createEffect(() => {
    const mailbox = store.selectedMailbox()
    if (mailbox === undefined || mailbox.synced_at !== null) {
      return
    }
    if (autoSyncedMailboxes.has(mailbox.id) || sync.syncing()) {
      return
    }
    autoSyncedMailboxes.add(mailbox.id)
    sync.syncWindow([mailbox.path], mailbox.account_id)
  })

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      onMouseUp={() => {
        if (isCollapsedSelection(renderer)) {
          clearSelection(renderer)
        }
      }}
    >
      <Show when={daemon.status() === undefined || configError() !== undefined}>
        <StartupScreen
          endpoint={daemon.endpoint()}
          failure={connected() ? configError() : daemon.failure()}
          retrying={!connected()}
        />
      </Show>
      <Show when={mainVisible()}>
        <MailWorkspace
          store={store}
          accounts={accounts()}
          syncing={sync.syncing()}
          pane={pane()}
          onPaneChange={setPane}
          connection={daemon.failure()}
          status={status()}
          syncWindow={sync.syncWindow}
          onStatus={(value) => {
            setStatus(value)
          }}
          onAddAccount={beginAddAccount}
          onOpenSettings={() => {
            setSettingsOpen(true)
          }}
          onOpenDraft={flow.openDraft}
          onMoveMessages={beginMove}
          onCompose={flow.beginCompose}
          onReply={flow.beginReply}
        />
      </Show>
      <Show when={setupVisible()}>
        <AccountSetup
          accounts={accounts()}
          mode={needsSetup() ? "initial" : "add"}
          onSaved={settings.handleAccountSaved}
          onCancel={
            needsSetup()
              ? undefined
              : () => {
                  setAddingAccount(false)
                }
          }
        />
      </Show>
      <Show when={settingsVisible()}>
        <Show when={appConfig()}>
          {(config) => (
            <SettingsScreen
              accounts={config().accounts}
              mailboxes={store.visibleMailboxes()}
              counts={store.counts()}
              sync={config().sync}
              send={config().send}
              notifications={config().notifications}
              editor={config().editor}
              onAddAccount={beginAddAccount}
              onClose={() => {
                setSettingsOpen(false)
              }}
              onAccountSaved={settings.handleAccountUpdated}
              onMailboxChanged={store.loadMailboxData}
              onSyncSaved={settings.handleSyncSaved}
              onSendSaved={settings.handleSendSaved}
              onNotificationsSaved={settings.handleNotificationsSaved}
              onEditorSaved={settings.handleEditorSaved}
              onDisconnected={daemon.retry}
            />
          )}
        </Show>
      </Show>
      <Show when={composerVisible()}>
        <Show when={flow.composing()}>
          {(seed) => (
            <ComposerScreen
              runtime={runtime}
              accounts={accounts()}
              seed={seed()}
              editor={appConfig()?.editor ?? "builtin"}
              sendDelaySeconds={appConfig()?.send.delaySeconds ?? 0}
              onClose={flow.closeComposer}
              onDisconnected={daemon.retry}
            />
          )}
        </Show>
      </Show>
      <Show when={moving()}>
        {(targets) => (
          <MovePicker
            accountLabel={targets().accountLabel}
            mailboxes={targets().mailboxes}
            onCancel={() => {
              setMoving(undefined)
            }}
            onSelect={(mailbox) => {
              setMoving(undefined)
              store.move(mailbox)
            }}
          />
        )}
      </Show>
    </box>
  )
}

export { App }
