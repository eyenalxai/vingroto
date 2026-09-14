import type { ScrollBoxRenderable } from "@opentui/core"

import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { Show, createEffect, createMemo, createResource, createSignal } from "solid-js"

import type { Pane } from "@/components/pane-layout"
import type { AppConfig } from "@/lib/config/schema"

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
import { StartupScreen } from "@/components/startup-screen"
import { StatusBar } from "@/components/status-bar"
import { useAppKeys } from "@/components/use-app-keys"
import { useMailStore } from "@/components/use-mail-store"
import { useMailSyncing } from "@/components/use-mail-syncing"
import { boot } from "@/lib/boot"

const App = () => {
  const runtime = useRuntime()
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const [report] = createResource(async () => runtime.runPromise(boot))
  const [status, setStatus] = createSignal("loading")
  const [pane, setPane] = createSignal<Pane>("folders")
  const [readerScroll, setReaderScroll] = createSignal<ScrollBoxRenderable>()

  const appConfig = createMemo((): AppConfig | undefined => {
    const value = report()
    if (value === undefined || value.config._tag !== "ok") {
      return undefined
    }
    return value.config.config
  })

  const store = useMailStore({
    runtime,
    config: appConfig,
    onStatus: (value: string) => {
      setStatus(value)
    },
  })

  const accountLabels = createMemo<ReadonlyMap<string, string>>(() => {
    const config = appConfig()
    if (config === undefined) {
      return new Map()
    }
    return new Map(config.accounts.map((account) => [account.id, account.label]))
  })

  const { startPeriodic, syncWindow, syncing } = useMailSyncing({
    config: appConfig,
    onStatus: (value: string) => {
      setStatus(value)
    },
    onSynced: store.loadFolderData,
    runtime,
  })

  const layout = createMemo(() => resolveLayoutMode(dimensions().width))
  const visiblePanes = createMemo(() => visiblePanesFor(layout(), pane()))
  const showPane = (target: Pane) => visiblePanes().includes(target)

  const listTitle = createMemo(() => {
    const row = store.selectedFolderRow()
    return `${row?.label ?? "messages"} · ${store.messages().length}`
  })

  useAppKeys({
    renderer,
    store,
    pane,
    setPane: (value: Pane) => {
      setPane(value)
    },
    readerScroll,
    syncWindow,
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
    <box width="100%" height="100%" flexDirection="column">
      <Show when={appConfig()} fallback={<StartupScreen report={report()} />}>
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
                  showMailbox={store.listIsVirtual()}
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
    </box>
  )
}

export { App }
