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
  list: "↑↓ move · / search · space mark · s read · u unread · r reply · R reply all · m move · esc back · c compose · ctrl+x · q quit",
  reader:
    "↑↓ scroll · pgup/pgdn · s read · u unread · r reply · R reply all · c compose · esc back · ctrl+x · q quit",
} as const

const viewHints: Readonly<Record<MailViewKind, Readonly<Record<Pane, string>>>> = {
  outbox: {
    mailbox: hints.mailbox,
    list: "↑↓ move · ⏎ read · s send now · x cancel · esc back · c compose · ctrl+x · q quit",
    reader:
      "↑↓ scroll · pgup/pgdn · s send now · x cancel · esc back · c compose · ctrl+x · q quit",
  },
  drafts: {
    mailbox: hints.mailbox,
    list: "↑↓ move · ⏎ edit · d delete · esc back · c compose · ctrl+x · q quit",
    reader: "↑↓ scroll · pgup/pgdn · d delete · esc back · c compose · ctrl+x · q quit",
  },
}

const markedHint = "s read · u unread · m move · ctrl+a mark all · esc clear"

const searchHint = "⏎ apply · esc clear · ctrl+a mark every match"

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
  markedHint,
  searchHint,
  visiblePanesFor,
  type LayoutMode,
  type Pane,
}
