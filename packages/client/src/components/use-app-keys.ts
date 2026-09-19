import type { CliRenderer, KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import type { AccountId } from "@vingroto/core/ids"
import type { Draft } from "@vingroto/core/protocol/outgoing"
import type { Setter } from "solid-js"

import { useKeyboard } from "@opentui/solid"

import type { Pane } from "@/components/pane-layout"
import type { MailStore } from "@/components/use-mail-store"

import { handleSearchKey, handleSelectionKey } from "@/components/editing-keys"
import { useLeaderKey } from "@/components/leader-key"
import { usePaneNavigation } from "@/components/use-pane-navigation"

interface AppKeysOptions {
  readonly renderer: CliRenderer
  readonly store: MailStore
  readonly pane: () => Pane
  readonly setPane: Setter<Pane>
  readonly readerScroll: () => ScrollBoxRenderable | undefined
  readonly syncWindow: (paths: readonly string[] | undefined, accountId?: AccountId) => void
  readonly onStatus: (message: string) => void
  readonly onAddAccount: () => void
  readonly onOpenSettings: () => void
  readonly onOpenDraft: (draft: Draft) => void
  readonly onMoveMessages: () => void
  readonly onCompose: () => void
  readonly onReply: (all: boolean) => void
  readonly searchActive: () => boolean
  readonly searchEditing: () => boolean
  readonly onSearchBegin: () => void
  readonly onSearchClear: () => void
  readonly onSearchCommit: () => void
  readonly onSearchType: (character: string) => void
  readonly onSearchBackspace: () => void
  readonly enabled: () => boolean
}
const isSearchPane = (pane: Pane) => pane === "list" || pane === "mailbox"
const useAppKeys = (options: AppKeysOptions) => {
  const navigation = usePaneNavigation({
    store: options.store,
    pane: options.pane,
    setPane: options.setPane,
    readerScroll: options.readerScroll,
    onOpenDraft: options.onOpenDraft,
  })
  const viewKind = navigation.viewKind

  const syncCurrent = () => {
    const row = options.store.selectedMailboxTreeRow()
    if (row === undefined || row.kind === "global") {
      options.syncWindow(["INBOX"])
      return
    }
    if (row.kind === "account" || row.kind === "unread") {
      options.syncWindow(["INBOX"], row.accountId)
      return
    }
    if (row.accountId !== undefined && row.mailboxPath !== undefined) {
      options.syncWindow([row.mailboxPath], row.accountId)
    }
  }

  const leader = useLeaderKey({
    onAction: (action) => {
      if (action === "add-account") {
        options.onAddAccount()
        return
      }
      if (action === "open-settings") {
        options.onOpenSettings()
        return
      }
      if (action === "open-outbox") {
        options.store.selectView("outbox")
        options.setPane("list")
        return
      }
      if (action === "open-drafts") {
        options.store.selectView("drafts")
        options.setPane("list")
        return
      }
      syncCurrent()
    },
  })

  const {
    activateFocused,
    focusNextPane,
    focusPreviousPane,
    moveSelection,
    scrollReaderPage,
    toggleFocusedAccount,
  } = navigation

  const handleSelection = (key: KeyEvent): boolean =>
    handleSelectionKey({ onStatus: options.onStatus, renderer: options.renderer }, key)

  const handleSearch = (key: KeyEvent): boolean =>
    handleSearchKey(
      {
        onSearchBackspace: options.onSearchBackspace,
        onSearchClear: options.onSearchClear,
        onSearchCommit: options.onSearchCommit,
        onSearchType: options.onSearchType,
        searchEditing: options.searchEditing,
      },
      key,
    )

  const handleListActionKey = (key: KeyEvent): boolean => {
    if (viewKind() !== undefined) {
      return false
    }
    if (key.name === "/" && !key.ctrl && !key.meta && !key.option && isSearchPane(options.pane())) {
      options.setPane("list")
      options.onSearchBegin()
      return true
    }
    if (options.pane() !== "list") {
      return false
    }
    if (key.name === "m" && !key.ctrl) {
      options.onMoveMessages()
      return true
    }
    if (key.ctrl && key.name === "a") {
      options.store.toggleMarkAll()
      return true
    }
    return false
  }

  const handleMailKey = (key: KeyEvent): boolean => {
    if (key.ctrl || key.meta || key.option || key.super === true) {
      return false
    }
    if (key.name === "c") {
      options.onCompose()
      return true
    }
    if (viewKind() !== undefined) {
      return false
    }
    if (options.pane() !== "list" && options.pane() !== "reader") {
      return false
    }
    if (key.name === "r") {
      options.onReply(key.shift)
      return true
    }
    if (key.name === "s") {
      options.store.markRead()
      return true
    }
    if (key.name === "u") {
      options.store.markUnread()
      return true
    }
    return false
  }

  const handleViewKey = (key: KeyEvent): boolean => {
    const view = viewKind()
    if (view === undefined) {
      return false
    }
    if (key.name === "escape") {
      options.setPane("mailbox")
      return true
    }
    if (key.ctrl || key.meta || key.option || key.super === true) {
      return false
    }
    if (view === "outbox" && key.name === "s") {
      options.store.outboxView.releaseSelected()
      return true
    }
    if (view === "outbox" && key.name === "x") {
      options.store.outboxView.cancelSelected()
      return true
    }
    if (view === "drafts" && (key.name === "d" || key.name === "delete")) {
      options.store.outboxView.deleteSelected()
      return true
    }
    return false
  }

  const handleActionKey = (key: KeyEvent): boolean => {
    if ((key.ctrl && key.name === "c") || (key.name === "q" && !key.ctrl)) {
      options.renderer.destroy()
      return true
    }
    if (key.name === "return") {
      activateFocused()
      return true
    }
    if (key.name === "space") {
      if (viewKind() !== undefined) {
        return true
      }
      if (options.pane() === "list") {
        options.store.toggleMarkCurrent()
        return true
      }
      toggleFocusedAccount()
      return true
    }
    if (handleMailKey(key)) {
      return true
    }
    if (handleListActionKey(key)) {
      return true
    }
    if (options.pane() === "mailbox" && key.name === "i" && !key.ctrl && viewKind() === undefined) {
      options.store.toggleMailboxMuted()
      return true
    }
    return false
  }

  const handleMovementKey = (key: KeyEvent): boolean => {
    if (key.name === "down" || (key.name === "j" && !key.ctrl)) {
      moveSelection(1)
      return true
    }
    if (key.name === "up" || (key.name === "k" && !key.ctrl)) {
      moveSelection(-1)
      return true
    }
    if (key.name === "pagedown" || (key.name === "f" && !key.ctrl)) {
      scrollReaderPage(1)
      return true
    }
    if (key.name === "pageup" || (key.name === "b" && !key.ctrl)) {
      scrollReaderPage(-1)
      return true
    }
    return false
  }

  const handlePaneKey = (key: KeyEvent): boolean => {
    if (key.name === "tab") {
      if (key.shift) {
        focusPreviousPane()
      } else {
        focusNextPane()
      }
      return true
    }
    if (key.name === "right" || (key.name === "l" && !key.ctrl)) {
      focusNextPane()
      return true
    }
    if (key.name === "left" || (key.name === "h" && !key.ctrl)) {
      focusPreviousPane()
      return true
    }
    if (key.name === "escape") {
      if (options.pane() === "list" && options.searchActive()) {
        options.onSearchClear()
        return true
      }
      if (options.pane() === "list" && options.store.markedIds().size > 0) {
        options.store.clearMarks()
        return true
      }
      if (options.pane() !== "mailbox") {
        focusPreviousPane()
      }
      return true
    }
    return false
  }

  useKeyboard((key: KeyEvent) => {
    if (!options.enabled()) {
      return
    }
    const handled =
      leader.handle(key) ||
      handleSelection(key) ||
      handleSearch(key) ||
      handleViewKey(key) ||
      handleActionKey(key) ||
      handleMovementKey(key) ||
      handlePaneKey(key)
    if (handled) {
      key.preventDefault()
    }
  })

  return { leaderActive: leader.active }
}

export { useAppKeys, type AppKeysOptions }
