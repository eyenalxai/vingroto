import type { ScrollBoxRenderable } from "@opentui/core"

import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { Effect } from "effect"
import { Show, createEffect, createMemo, createResource, createSignal } from "solid-js"

import type { Pane } from "@/components/pane-layout"
import type { AppConfig, AccountConfig } from "@/lib/config/schema"

import { FolderPane } from "@/components/folder-pane"
import { MessageList } from "@/components/message-list"
import { MessageView } from "@/components/message-view"
import {
  describePaneHint,
  folderPaneWidthFor,
  resolveLayoutMode,
  visiblePanesFor,
} from "@/components/pane-layout"
import { useRuntime } from "@/components/runtime-provider"
import { AccountSetup } from "@/components/setup/account-setup"
import { StartupScreen } from "@/components/startup-screen"
import { StatusBar } from "@/components/status-bar"
import { useAppKeys } from "@/components/use-app-keys"
import { useMailStore } from "@/components/use-mail-store"
import { useMailSyncing } from "@/components/use-mail-syncing"
import { boot } from "@/lib/boot"
import { openExternal } from "@/lib/external"
import { clearSelection, isCollapsedSelection } from "@/lib/selection"

const App = () => {
  const runtime = useRuntime()
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const [report, { refetch }] = createResource(async () => runtime.runPromise(boot))
  const [status, setStatus] = createSignal("loading")
  const [pane, setPane] = createSignal<Pane>("folders")
  const [addingAccount, setAddingAccount] = createSignal(false)
  const [readerScroll, setReaderScroll] = createSignal<ScrollBoxRenderable>()

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
      report() !== undefined && configError() === undefined && !needsSetup() && !addingAccount(),
  )
  const setupVisible = createMemo(
    () =>
      report() !== undefined && configError() === undefined && (needsSetup() || addingAccount()),
  )

  const store = useMailStore({
    runtime,
    config: appConfig,
    onStatus: (value: string) => {
      setStatus(value)
    },
  })

  const accountLabels = createMemo<ReadonlyMap<string, string>>(
    () => new Map(accounts().map((account) => [account.id, account.label])),
  )

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

  const layout = createMemo(() => resolveLayoutMode(dimensions().width))
  const visiblePanes = createMemo(() => visiblePanesFor(layout(), pane()))
  const showPane = (target: Pane) => visiblePanes().includes(target)

  const listTitle = createMemo(() => {
    const row = store.selectedFolderRow()
    return `${row?.label ?? "messages"} · ${store.messages().length}`
  })

  const openLink = (url: string) => {
    const program = Effect.gen(function* openLinkInBrowser() {
      yield* openExternal(url).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            setStatus(`could not open link · ${error.message}`)
          }),
        ),
      )
    })
    runtime.runFork(program)
  }

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

  useAppKeys({
    renderer,
    store,
    pane,
    setPane: (value: Pane) => {
      setPane(value)
    },
    readerScroll,
    syncWindow,
    onStatus: (value: string) => {
      setStatus(value)
    },
    onAddAccount: () => {
      setAddingAccount(true)
    },
    enabled: mainVisible,
  })

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
        <box flexGrow={1} flexDirection="column">
          <box flexGrow={1} flexDirection="row" gap={1}>
            <Show when={showPane("folders")}>
              <box width={folderPaneWidthFor(layout())} flexDirection="column">
                <FolderPane
                  rows={store.folderRows()}
                  selectedKey={store.selectedFolderKey()}
                  focused={pane() === "folders"}
                />
              </box>
            </Show>
            <Show when={showPane("list")}>
              <box flexGrow={1} flexDirection="column">
                <MessageList
                  title={listTitle()}
                  messages={store.messages()}
                  selectedId={store.selectedMessageId()}
                  focused={pane() === "list"}
                />
              </box>
            </Show>
            <Show when={showPane("reader")}>
              <box flexGrow={1} flexDirection="column">
                <MessageView
                  detail={store.detail()}
                  body={store.body()}
                  focused={pane() === "reader"}
                  accountLabels={accountLabels()}
                  onOpenLink={openLink}
                  onScrollRef={(box) => {
                    setReaderScroll(box)
                  }}
                />
              </box>
            </Show>
          </box>
          <StatusBar message={status()} syncing={syncing()} hint={describePaneHint(pane())} />
        </box>
      </Show>
      <Show when={setupVisible()}>
        <AccountSetup
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
    </box>
  )
}

export { App }
