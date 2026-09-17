import type { CliRenderer, KeyEvent, ScrollBoxRenderable } from "@opentui/core"

import { useKeyboard } from "@opentui/solid"

import type { Pane } from "@/components/pane-layout"
import type { MailStore } from "@/components/use-mail-store"

import { paneOrder } from "@/components/pane-layout"

interface AppKeysOptions {
  readonly renderer: CliRenderer
  readonly store: MailStore
  readonly pane: () => Pane
  readonly setPane: (pane: Pane) => void
  readonly readerScroll: () => ScrollBoxRenderable | undefined
  readonly syncWindow: (paths: readonly string[] | undefined, accountId?: string) => void
}

const useAppKeys = (options: AppKeysOptions) => {
  const focusNextPane = () => {
    const index = paneOrder.indexOf(options.pane())
    options.setPane(paneOrder[(index + 1) % paneOrder.length] ?? "folders")
  }

  const focusPreviousPane = () => {
    const index = paneOrder.indexOf(options.pane())
    options.setPane(paneOrder[(index + paneOrder.length - 1) % paneOrder.length] ?? "folders")
  }

  const scrollReaderPage = (direction: number) => {
    const box = options.readerScroll()
    if (box !== undefined) {
      box.scrollBy(direction / 2, "viewport")
    }
  }

  const moveSelection = (delta: number) => {
    const current = options.pane()
    if (current === "folders") {
      options.store.moveFolderSelection(delta)
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
    const row = options.store.selectedFolderRow()
    if (row === undefined || row.kind === "virtual") {
      options.syncWindow(["INBOX"])
      return
    }
    if (row.kind === "account") {
      options.syncWindow(["INBOX"], row.accountId)
      return
    }
    if (row.accountId !== undefined && row.mailboxPath !== undefined) {
      options.syncWindow([row.mailboxPath], row.accountId)
    }
  }

  const activateFocused = () => {
    const current = options.pane()
    if (current === "folders") {
      const row = options.store.selectedFolderRow()
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
    const row = options.store.selectedFolderRow()
    if (row?.kind === "account") {
      options.store.toggleAccountRow(row.key)
    }
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
      toggleFocusedAccount()
      return true
    }
    if (key.name === "r" && !key.ctrl) {
      syncCurrent()
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
      if (options.pane() !== "folders") {
        focusPreviousPane()
      }
      return true
    }
    return false
  }

  useKeyboard((key: KeyEvent) => {
    if (handleActionKey(key)) {
      return
    }
    if (handleMovementKey(key)) {
      return
    }
    handlePaneKey(key)
  })
}

export { useAppKeys, type AppKeysOptions }
