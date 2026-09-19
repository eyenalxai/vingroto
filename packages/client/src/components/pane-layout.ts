import type { MailViewKind } from "@/lib/mail/mailbox-tree"

type Pane = "mailbox" | "list" | "reader"
type LayoutMode = "three" | "two" | "single"

const paneOrder: readonly Pane[] = ["mailbox", "list", "reader"]

const wideLayoutWidth = 110
const mediumLayoutWidth = 64
const wideMailboxPaneWidth = 30
const mediumMailboxPaneWidth = 26

const hints = {
  mailbox:
    "↑↓ move · ⏎ open · space fold · i mute · / search · c compose · tab next pane · ctrl+x · q quit",
  list: "↑↓ move · / search · space mark · s read · u unread · r reply · shift+r reply all · m move · esc back · c compose · ctrl+x · q quit",
  reader:
    "↑↓ scroll · pgup/pgdn · s read · u unread · r reply · shift+r reply all · c compose · esc back · ctrl+x · q quit",
} as const

const viewMailboxHint = "↑↓ move · ⏎ open · c compose · tab next pane · ctrl+x · q quit"

const viewHints: Readonly<Record<MailViewKind, Readonly<Record<Pane, string>>>> = {
  outbox: {
    mailbox: viewMailboxHint,
    list: "↑↓ move · ⏎ read · s send now · x cancel · esc back · c compose · ctrl+x · q quit",
    reader:
      "↑↓ move · pgup/pgdn scroll · s send now · x cancel · esc back · c compose · ctrl+x · q quit",
  },
  drafts: {
    mailbox: viewMailboxHint,
    list: "↑↓ move · ⏎ edit · d delete · esc back · c compose · ctrl+x · q quit",
    reader: "↑↓ move · pgup/pgdn scroll · d delete · esc back · c compose · ctrl+x · q quit",
  },
}

const markedActionsHint = "s read · u unread · m move · ctrl+a mark all"

const markedHint = `${markedActionsHint} · esc clear`

const searchHint = "⏎ apply · esc clear · ctrl+a mark every match"

const searchClearHint = "esc clear search"

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

const describePaneHint = (pane: Pane, view: MailViewKind | undefined): string => {
  if (view === undefined) {
    return hints[pane]
  }
  return viewHints[view][pane]
}

export {
  describePaneHint,
  mailboxPaneWidthFor,
  paneOrder,
  resolveLayoutMode,
  markedActionsHint,
  markedHint,
  searchClearHint,
  searchHint,
  visiblePanesFor,
  type LayoutMode,
  type Pane,
}
