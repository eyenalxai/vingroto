import type { CliRenderer, KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import type { AccountId } from "@vingroto/core/ids"
import type { Setter } from "solid-js"

import { useKeyboard } from "@opentui/solid"

import type { Pane } from "@/components/pane-layout"
import type { MailStore } from "@/components/use-mail-store"

import { handleSearchKey, handleSelectionKey } from "@/components/editing-keys"
import { useLeaderKey } from "@/components/leader-key"
import { paneOrder } from "@/components/pane-layout"

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
  readonly onOpenOutbox: () => void
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
  const focusNextPane = () => {
    const index = paneOrder.indexOf(options.pane())
    options.setPane(paneOrder[(index + 1) % paneOrder.length] ?? "mailbox")
  }

  const focusPreviousPane = () => {
    const index = paneOrder.indexOf(options.pane())
    options.setPane(paneOrder[(index + paneOrder.length - 1) % paneOrder.length] ?? "mailbox")
  }

  const scrollReaderPage = (direction: number) => {
    const box = options.readerScroll()
    if (box !== undefined) {
      box.scrollBy(direction / 2, "viewport")
    }
  }

  const moveSelection = (delta: number) => {
    const current = options.pane()
    if (current === "mailbox") {
      options.store.moveRowSelection(delta)
      return
    }
    if (current === "list") {
      options.store.moveMessageSelection(delta)
      return
    }
    const box = options.readerScroll()
    if (box !== undefined) {
      box.scrollBy(delta, "step")
    }
  }

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
        options.onOpenOutbox()
        return
      }
      syncCurrent()
    },
  })

  const activateFocused = () => {
    const current = options.pane()
    if (current === "mailbox") {
      const row = options.store.selectedMailboxTreeRow()
      if (row?.kind === "account") {
        options.store.toggleAccountRow(row.key)
        return
      }
      focusNextPane()
      return
    }
    if (current === "list") {
      focusNextPane()
    }
  }

  const toggleFocusedAccount = () => {
    const row = options.store.selectedMailboxTreeRow()
    if (row?.kind === "account") {
      options.store.toggleAccountRow(row.key)
    }
  }

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
    if (options.pane() !== "list" && options.pane() !== "reader") {
      return false
    }
    if (key.name === "r") {
      options.onReply(key.shift)
      return true
    }
    if (key.name === "s") {
      if (key.shift) {
        options.store.markUnread()
      } else {
        options.store.markRead()
      }
      return true
    }
    if (key.name === "u") {
      options.store.markUnread()
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
    if (options.pane() === "mailbox" && key.name === "i" && !key.ctrl) {
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
