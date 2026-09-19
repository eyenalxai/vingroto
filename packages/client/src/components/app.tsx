import type { AccountConfig, AppConfig } from "@vingroto/core/config/schema"
import type { AccountId, MailboxId } from "@vingroto/core/ids"

import { useRenderer } from "@opentui/solid"
import { Effect } from "effect"
import { Show, createEffect, createMemo, createSignal, untrack } from "solid-js"

import type { Pane } from "@/components/pane-layout"
import type { MoveTargetsResult } from "@/lib/mail/move"

import { MailWorkspace } from "@/components/mail-workspace"
import { MovePicker } from "@/components/move-picker"
import { useRuntime } from "@/components/runtime-provider"
import { SettingsScreen } from "@/components/settings/settings-screen"
import { AccountSetup } from "@/components/setup/account-setup"
import { StartupScreen } from "@/components/startup-screen"
import { useDaemonStatus } from "@/components/use-daemon-status"
import { useMailStore } from "@/components/use-mail-store"
import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"
import { resolveMoveTargets } from "@/lib/mail/move"
import { clearSelection, isCollapsedSelection } from "@/lib/selection"

type MoveTargets = Extract<MoveTargetsResult, { _tag: "ok" }>

const App = () => {
  const runtime = useRuntime()
  const renderer = useRenderer()
  const daemon = useDaemonStatus(runtime)
  const [status, setStatus] = createSignal("ready")
  const [syncing, setSyncing] = createSignal(false)
  const [addingAccount, setAddingAccount] = createSignal(false)
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const [moving, setMoving] = createSignal<MoveTargets | undefined>()
  const [pane, setPane] = createSignal<Pane>("mailbox")

  const appConfig = createMemo((): AppConfig | undefined => {
    const value = daemon.status()
    return value !== undefined && value.config._tag === "ok" ? value.config.config : undefined
  })

  const accounts = createMemo<readonly AccountConfig[]>(() => appConfig()?.accounts ?? [])

  const configError = createMemo((): string | undefined => {
    const value = daemon.status()
    return value !== undefined && value.config._tag === "error" ? value.config.message : undefined
  })

  const needsSetup = createMemo(() => daemon.status()?.config._tag === "empty")
  const connected = createMemo((prior: boolean) => prior || daemon.status() !== undefined, false)
  const mainVisible = createMemo(
    () =>
      connected() &&
      configError() === undefined &&
      !needsSetup() &&
      !addingAccount() &&
      !settingsOpen() &&
      moving() === undefined,
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

  const store = useMailStore({
    config: appConfig,
    connected: () => connected(),
    onConfigChanged: () => {
      runtime.runFork(Effect.promise(async () => daemon.refresh()))
    },
    onDisconnected: (message: string) => {
      daemon.retry(message)
    },
    onStatus: (value: string) => {
      setStatus(value)
    },
    runtime,
  })

  const syncWindow = (paths?: readonly string[], accountId?: AccountId) => {
    untrack(() => {
      const config = appConfig()
      if (config === undefined || syncing()) {
        return
      }
      const accountsToSync =
        accountId === undefined
          ? config.accounts
          : config.accounts.filter((account) => account.id === accountId)
      if (accountsToSync.length === 0) {
        return
      }
      setSyncing(true)
      setStatus(paths === undefined ? "syncing all mailboxes" : `syncing ${paths.join(", ")}`)
      const program = Effect.gen(function* runSync() {
        const syncRequest = { paths: paths?.join(",") ?? "all", account: accountId ?? "all" }
        yield* Effect.logInfo("sync requested").pipe(Effect.annotateLogs(syncRequest))
        const client = yield* MailClient
        const request = {
          ...(accountId === undefined ? {} : { accountId }),
          ...(paths === undefined ? {} : { paths }),
        }
        const result = yield* client.sync(request).pipe(Effect.result)
        if (result._tag === "Failure") {
          yield* Effect.sync(() => {
            const failure = describeClientFailure(result.failure)
            if (failure._tag === "connection") {
              daemon.retry(failure.message)
              return
            }
            setStatus(`sync failed · ${failure.message}`)
          })
          return
        }
        const errors: string[] = []
        let stored = 0
        for (const report of result.success) {
          stored += report.stored
          for (const message of report.errors) {
            errors.push(message)
          }
        }
        const failure = errors[0]
        const message =
          failure === undefined
            ? stored === 0
              ? "up to date"
              : `synced · ${stored} new`
            : errors.length > 1
              ? `sync failed · ${failure} (+${errors.length - 1} more)`
              : `sync failed · ${failure}`
        yield* Effect.sync(() => setStatus(message))
        const failureMessage = errors.join(" · ")
        yield* errors.length > 0
          ? Effect.logWarning("sync failed").pipe(Effect.annotateLogs({ errors: failureMessage }))
          : Effect.logInfo("sync finished").pipe(Effect.annotateLogs({ stored }))
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            setSyncing(false)
            store.loadMailboxData()
          }),
        ),
      )
      runtime.runFork(program)
    })
  }

  const refreshConfig = async () => {
    await daemon.refresh()
    store.loadMailboxData()
  }

  const handleAccountSaved = (account: AccountConfig) => {
    setAddingAccount(false)
    setStatus(`account ${account.label} saved · syncing`)
    runtime.runFork(
      Effect.promise(async () => daemon.refresh()).pipe(Effect.andThen(Effect.sync(syncWindow))),
    )
  }

  const handleAccountUpdated = (account: AccountConfig) => {
    setStatus(`account ${account.label} updated`)
    runtime.runFork(Effect.promise(refreshConfig))
  }

  const handleSyncSaved = () => {
    setStatus("sync settings saved")
    runtime.runFork(Effect.promise(refreshConfig))
  }

  const beginAddAccount = () => {
    setSettingsOpen(false)
    setAddingAccount(true)
  }

  const beginMove = () => {
    const selected = store.selectedMessage()
    const marked = store.markedMessages()
    const items = marked.length > 0 ? marked : selected === undefined ? [] : [selected]
    const result = resolveMoveTargets(items, accounts(), store.visibleMailboxes())
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
          syncing={syncing()}
          pane={pane()}
          onPaneChange={setPane}
          connection={daemon.failure()}
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
              onMailboxChanged={store.loadMailboxData}
              onSyncSaved={handleSyncSaved}
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
