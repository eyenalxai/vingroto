import type { ScrollBoxRenderable } from "@opentui/core"
import type { AccountConfig } from "@vingroto/core/config/schema"
import type { AccountId } from "@vingroto/core/ids"
import type { Setter } from "solid-js"

import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { Effect } from "effect"
import { Show, createMemo, createSignal } from "solid-js"

import type { Pane } from "@/components/pane-layout"
import type { MailStore } from "@/components/use-mail-store"

import { describeLeaderHint } from "@/components/leader-key"
import { MailboxPane } from "@/components/mailbox-pane"
import { MessageList } from "@/components/message-list"
import { MessageView } from "@/components/message-view"
import {
  describePaneHint,
  mailboxPaneWidthFor,
  markedHint,
  resolveLayoutMode,
  searchHint,
  visiblePanesFor,
} from "@/components/pane-layout"
import { useRuntime } from "@/components/runtime-provider"
import { StatusBar } from "@/components/status-bar"
import { useAppKeys } from "@/components/use-app-keys"
import { openExternal } from "@/lib/external"

interface MailWorkspaceProps {
  readonly store: MailStore
  readonly accounts: readonly AccountConfig[]
  readonly syncing: boolean
  readonly status: string
  readonly connection: string | undefined
  readonly pane: Pane
  readonly onPaneChange: Setter<Pane>
  readonly syncWindow: (paths: readonly string[] | undefined, accountId?: AccountId) => void
  readonly onStatus: (message: string) => void
  readonly onAddAccount: () => void
  readonly onOpenSettings: () => void
  readonly onMoveMessages: () => void
}

const MailWorkspace = (props: MailWorkspaceProps) => {
  const runtime = useRuntime()
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const [readerScroll, setReaderScroll] = createSignal<ScrollBoxRenderable>()

  const layout = createMemo(() => resolveLayoutMode(dimensions().width))
  const visiblePanes = createMemo(() => visiblePanesFor(layout(), props.pane))
  const showPane = (target: Pane) => visiblePanes().includes(target)

  const accountLabels = createMemo<ReadonlyMap<AccountId, string>>(
    () => new Map(props.accounts.map((account) => [account.id, account.label])),
  )

  const keys = useAppKeys({
    renderer,
    store: props.store,
    pane: () => props.pane,
    setPane: props.onPaneChange,
    readerScroll,
    syncWindow: props.syncWindow,
    onStatus: props.onStatus,
    onAddAccount: props.onAddAccount,
    onOpenSettings: props.onOpenSettings,
    onMoveMessages: props.onMoveMessages,
    onSearchBackspace: props.store.searchBackspace,
    onSearchBegin: props.store.beginSearch,
    onSearchClear: props.store.clearSearch,
    onSearchCommit: props.store.commitSearch,
    onSearchType: props.store.typeSearchCharacter,
    searchActive: props.store.searchActive,
    searchEditing: props.store.searchEditing,
    enabled: () => true,
  })

  const listTitle = createMemo(() => {
    const row = props.store.selectedMailboxTreeRow()
    const parts = [row?.label ?? "messages"]
    if (props.store.searchActive()) {
      parts.push(`search: ${props.store.searchQuery()}`)
    }
    parts.push(`${props.store.messages().length}`)
    const marked = props.store.markedIds().size
    if (marked > 0) {
      parts.push(`${marked} marked`)
    }
    return parts.join(" · ")
  })

  const statusHint = createMemo(() => {
    if (keys.leaderActive()) {
      return describeLeaderHint()
    }
    if (props.pane === "list" && props.store.searchEditing()) {
      return searchHint
    }
    if (props.pane === "list" && props.store.markedIds().size > 0) {
      return markedHint
    }
    return describePaneHint(props.pane)
  })

  const busy = createMemo(
    () =>
      props.syncing ||
      props.store.pendingMessageIds().size > 0 ||
      props.store.mutingMailboxIds().size > 0 ||
      props.store.syncingMailboxIds().size > 0 ||
      props.store.loadingDetail() ||
      (props.store.mailboxes().length === 0 && props.store.loadingMailboxes()),
  )

  const openLink = (url: string) => {
    const program = Effect.gen(function* openLinkInBrowser() {
      yield* openExternal(url).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            props.onStatus(`could not open link · ${error.message}`)
          }),
        ),
      )
    })
    runtime.runFork(program)
  }

  return (
    <box flexGrow={1} flexDirection="column">
      <box flexGrow={1} flexDirection="row" gap={1}>
        <Show when={showPane("mailbox")}>
          <box width={mailboxPaneWidthFor(layout())} flexDirection="column">
            <MailboxPane
              rows={props.store.mailboxTreeRows()}
              selectedKey={props.store.selectedListKey()}
              focused={props.pane === "mailbox"}
              syncingIds={props.store.syncingMailboxIds()}
              mutingIds={props.store.mutingMailboxIds()}
            />
          </box>
        </Show>
        <Show when={showPane("list")}>
          <box flexGrow={1} flexDirection="column">
            <MessageList
              title={listTitle()}
              messages={props.store.messages()}
              selectedId={props.store.selectedMessageId()}
              marked={props.store.markedIds()}
              pending={props.store.pendingMessageIds()}
              loading={props.store.messages().length === 0 && props.store.loadingMessages()}
              focused={props.pane === "list"}
              searchActive={props.store.searchActive()}
              searchEditing={props.store.searchEditing()}
              searchQuery={props.store.searchQuery()}
            />
          </box>
        </Show>
        <Show when={showPane("reader")}>
          <box flexGrow={1} flexDirection="column">
            <MessageView
              detail={props.store.detail()}
              body={props.store.body()}
              loadingDetail={props.store.loadingDetail()}
              focused={props.pane === "reader"}
              accountLabels={accountLabels()}
              onOpenLink={openLink}
              onBodyDisplayed={(messageId) => {
                props.store.applyReadOnDisplay(messageId)
              }}
              onScrollRef={(box) => {
                setReaderScroll(box)
              }}
            />
          </box>
        </Show>
      </box>
      <StatusBar message={props.connection ?? props.status} busy={busy()} hint={statusHint()} />
    </box>
  )
}

export { MailWorkspace, type MailWorkspaceProps }
