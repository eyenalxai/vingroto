type Pane = "folders" | "list" | "reader"
type LayoutMode = "three" | "two" | "single"

const paneOrder: readonly Pane[] = ["folders", "list", "reader"]

const wideLayoutWidth = 110
const mediumLayoutWidth = 64
const wideFolderPaneWidth = 30
const mediumFolderPaneWidth = 26

const hints = {
  folders: "↑↓ move · ⏎ open · space fold · r sync · tab pane · q quit",
  list: "↑↓ move · ⏎ read · esc folders · r sync · q quit",
  reader: "↑↓ scroll · pgup/pgdn · esc back · r sync · q quit",
} as const

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
    return pane === "reader" ? ["folders", "reader"] : ["folders", "list"]
  }
  return [pane]
}

const folderPaneWidthFor = (mode: LayoutMode): number | "100%" => {
  if (mode === "three") {
    return wideFolderPaneWidth
  }
  if (mode === "two") {
    return mediumFolderPaneWidth
  }
  return "100%"
}

const describePaneHint = (pane: Pane): string => hints[pane]

export {
  describePaneHint,
  folderPaneWidthFor,
  paneOrder,
  resolveLayoutMode,
  visiblePanesFor,
  type LayoutMode,
  type Pane,
}
