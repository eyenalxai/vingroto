type Pane = "mailbox" | "list" | "reader"
type LayoutMode = "three" | "two" | "single"

const paneOrder: readonly Pane[] = ["mailbox", "list", "reader"]

const wideLayoutWidth = 110
const mediumLayoutWidth = 64
const wideMailboxPaneWidth = 30
const mediumMailboxPaneWidth = 26

const hints = {
  mailbox: "↑↓ move · ⏎ open · space fold · i mute · / search · tab next pane · ctrl+x · q quit",
  list: "↑↓ move · / search · space mark · r read · u unread · m move · esc back · ctrl+x · q quit",
  reader: "↑↓ scroll · pgup/pgdn · esc back · ctrl+x · q quit",
} as const

const markedHint = "r read · u unread · m move · ctrl+a mark all · esc clear"

const searchHint = "enter apply · esc clear · ctrl+a mark every match"

const resolveLayoutMode = (width: number): LayoutMode => {
  if (width >= wideLayoutWidth) {
    return "three"
  }
  if (width >= mediumLayoutWidth) {
    return "two"
  }
  return "single"
}

const visiblePanesFor = (mode: LayoutMode, pane: Pane): readonly Pane[] => {
  if (mode === "three") {
    return paneOrder
  }
  if (mode === "two") {
    return pane === "reader" ? ["mailbox", "reader"] : ["mailbox", "list"]
  }
  return [pane]
}

const mailboxPaneWidthFor = (mode: LayoutMode): number | "100%" => {
  if (mode === "three") {
    return wideMailboxPaneWidth
  }
  if (mode === "two") {
    return mediumMailboxPaneWidth
  }
  return "100%"
}

const describePaneHint = (pane: Pane): string => hints[pane]

export {
  describePaneHint,
  mailboxPaneWidthFor,
  paneOrder,
  resolveLayoutMode,
  markedHint,
  searchHint,
  visiblePanesFor,
  type LayoutMode,
  type Pane,
}
