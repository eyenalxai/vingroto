import type { ScrollBoxRenderable } from "@opentui/core"
import type { Draft } from "@vingroto/core/protocol/outgoing"
import type { Setter } from "solid-js"

import type { Pane } from "@/components/pane-layout"
import type { MailStore } from "@/components/use-mail-store"

import { paneOrder } from "@/components/pane-layout"

interface PaneNavigationOptions {
  readonly store: MailStore
  readonly pane: () => Pane
  readonly setPane: Setter<Pane>
  readonly readerScroll: () => ScrollBoxRenderable | undefined
  readonly onOpenDraft: (draft: Draft) => void
}

const usePaneNavigation = (options: PaneNavigationOptions) => {
  const viewKind = () => options.store.selectedView()

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
    if (viewKind() !== undefined) {
      options.store.outboxView.moveSelection(delta)
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
    if (current !== "list") {
      return
    }
    const view = viewKind()
    if (view === "drafts") {
      options.store.outboxView.openDraft(options.onOpenDraft)
      return
    }
    if (view === "outbox") {
      options.setPane("reader")
      return
    }
    focusNextPane()
  }

  const toggleFocusedAccount = () => {
    const row = options.store.selectedMailboxTreeRow()
    if (row?.kind === "account") {
      options.store.toggleAccountRow(row.key)
    }
  }

  return {
    activateFocused,
    focusNextPane,
    focusPreviousPane,
    moveSelection,
    scrollReaderPage,
    toggleFocusedAccount,
    viewKind,
  }
}

export { usePaneNavigation, type PaneNavigationOptions }
