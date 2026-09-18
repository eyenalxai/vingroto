import { useRenderer } from "@opentui/solid"
import { Effect } from "effect"
import { Show, createEffect, createMemo, createResource, createSignal } from "solid-js"

import type { AppConfig, AccountConfig } from "@/lib/config/schema"
import type { MailboxRow } from "@/lib/store/mailboxes"

import { MailWorkspace } from "@/components/mail-workspace"
import { MovePicker } from "@/components/move-picker"
import { useRuntime } from "@/components/runtime-provider"
import { SettingsScreen } from "@/components/settings/settings-screen"
import { AccountSetup } from "@/components/setup/account-setup"
import { StartupScreen } from "@/components/startup-screen"
import { useMailStore } from "@/components/use-mail-store"
import { useMailSyncing } from "@/components/use-mail-syncing"
import { boot } from "@/lib/boot"
import { resolveMoveTargets } from "@/lib/mail/move"
import { clearSelection, isCollapsedSelection } from "@/lib/selection"

interface MoveTargets {
  readonly accountLabel: string
  readonly mailboxes: readonly MailboxRow[]
}

const App = () => {
  const runtime = useRuntime()
  const renderer = useRenderer()
  const [report, { refetch }] = createResource(async () => runtime.runPromise(boot))
  const [status, setStatus] = createSignal("loading")
  const [addingAccount, setAddingAccount] = createSignal(false)
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const [moving, setMoving] = createSignal<MoveTargets | undefined>()

  const appConfig = createMemo((): AppConfig | undefined => {
    const value = report()
    if (value === undefined || value.config._tag !== "ok") {
      return undefined
    }
    return value.config.config
  })

  const accounts = createMemo<readonly AccountConfig[]>(() => appConfig()?.accounts ?? [])

  const configError = createMemo((): string | undefined => {
    const value = report()
    return value !== undefined && value.config._tag === "error" ? value.config.message : undefined
  })

  const needsSetup = createMemo(() => report()?.config._tag === "empty")
  const mainVisible = createMemo(
    () =>
      report() !== undefined &&
      configError() === undefined &&
      !needsSetup() &&
      !addingAccount() &&
      !settingsOpen() &&
      moving() === undefined,
  )
  const setupVisible = createMemo(
    () =>
      report() !== undefined &&
      configError() === undefined &&
      !settingsOpen() &&
      (needsSetup() || addingAccount()),
  )
  const settingsVisible = createMemo(
    () => settingsOpen() && appConfig() !== undefined && !addingAccount(),
  )

  const store = useMailStore({
    runtime,
    config: appConfig,
    onStatus: (value: string) => {
      setStatus(value)
    },
  })

  const { startPeriodic, syncWindow, syncing } = useMailSyncing({
    config: appConfig,
    onStatus: (value: string) => {
      setStatus(value)
    },
    onSynced: () => {
      store.loadFolderData()
      store.prefetchUnread()
    },
    runtime,
  })

  const reloadConfig = () =>
    Effect.gen(function* reloadConfiguration() {
      yield* Effect.promise(async () => refetch())
      yield* Effect.sync(() => {
        store.loadFolderData()
      })
    })

  const handleAccountSaved = (account: AccountConfig) => {
    setAddingAccount(false)
    setStatus(`account ${account.label} saved · syncing`)
    const program = Effect.gen(function* reloadAfterSave() {
      yield* Effect.promise(async () => refetch())
      yield* Effect.sync(() => {
        syncWindow()
      })
    })
    runtime.runFork(program)
  }

  const handleAccountUpdated = (account: AccountConfig) => {
    setStatus(`account ${account.label} updated`)
    runtime.runFork(reloadConfig())
  }

  const handleSyncSaved = () => {
    setStatus("sync settings saved")
    runtime.runFork(reloadConfig())
  }

  const beginAddAccount = () => {
    setSettingsOpen(false)
    setAddingAccount(true)
  }

  const beginMove = () => {
    const selected = store.selectedMessage()
    const tagged = store.taggedMessages()
    const items = tagged.length > 0 ? tagged : selected === undefined ? [] : [selected]
    const result = resolveMoveTargets(items, accounts(), store.visibleMailboxes())
    if (result._tag === "error") {
      setStatus(result.message)
      return
    }
    setMoving({
      accountLabel: result.accountLabel,
      mailboxes: result.mailboxes,
    })
  }

  createEffect(() => {
    const config = appConfig()
    if (config === undefined) {
      return
    }
    startPeriodic(() => config.sync.intervalMinutes)
  })

  const autoSyncedMailboxes = new Set<number>()

  createEffect(() => {
    const mailbox = store.selectedMailbox()
    if (mailbox === undefined || mailbox.synced_at !== null) {
      return
    }
    if (autoSyncedMailboxes.has(mailbox.id) || syncing()) {
      return
    }
    autoSyncedMailboxes.add(mailbox.id)
    syncWindow([mailbox.path], mailbox.account_id)
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
      <Show when={report() === undefined}>
        <StartupScreen report={undefined} />
      </Show>
      <Show when={configError() !== undefined}>
        <StartupScreen report={report()} />
      </Show>
      <Show when={mainVisible()}>
        <MailWorkspace
          store={store}
          accounts={accounts()}
          syncing={syncing()}
          status={status()}
          syncWindow={syncWindow}
          onStatus={(value) => {
            setStatus(value)
          }}
          onAddAccount={beginAddAccount}
          onOpenSettings={() => {
            setSettingsOpen(true)
          }}
          onMoveMessages={beginMove}
        />
      </Show>
      <Show when={setupVisible()}>
        <AccountSetup
          accounts={accounts()}
          mode={needsSetup() ? "initial" : "add"}
          onSaved={handleAccountSaved}
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
              onAddAccount={beginAddAccount}
              onClose={() => {
                setSettingsOpen(false)
              }}
              onAccountSaved={handleAccountUpdated}
              onMailboxChanged={store.loadFolderData}
              onSyncSaved={handleSyncSaved}
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
