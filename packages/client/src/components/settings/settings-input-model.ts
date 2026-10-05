import type { KeyEvent } from "@opentui/core"

import type { SettingsItem, SettingsRow } from "@/components/settings/settings-rows"

const isActivatable = (row: SettingsRow): boolean =>
  row.kind === "choice" || row.kind === "toggle" || row.kind === "mailbox" || row.kind === "action"

const cycleRow = (row: SettingsRow, delta: number): boolean => {
  if (row.kind === "choice") {
    row.cycle(delta)
    return true
  }
  if (row.kind === "toggle" || row.kind === "mailbox") {
    row.toggle()
    return true
  }
  return false
}

const arrowDelta = (event: KeyEvent): number | undefined => {
  if (event.name === "down" || (event.name === "j" && !event.ctrl)) {
    return 1
  }
  if (event.name === "up" || (event.name === "k" && !event.ctrl)) {
    return -1
  }
  return undefined
}

const contentHint = (item: SettingsItem | undefined): string => {
  if (item === undefined) {
    return "esc sections"
  }
  if (item.kind === "group") {
    return item.group.reorder === undefined
      ? "↑↓ rows · space fold · esc sections"
      : "↑↓ rows · space fold · shift+↑↓ reorder · ctrl+s save · esc sections"
  }
  switch (item.row.kind) {
    case "action": {
      return item.row.hint ?? "⏎ add account · esc sections"
    }
    case "choice": {
      return "←→ cycle · ctrl+s save · esc sections"
    }
    case "mailbox": {
      return "space mute or unmute · esc sections"
    }
    case "reading": {
      return "↑↓ move · esc sections"
    }
    case "secret":
    case "text": {
      return "⏎ edit · ctrl+s save · esc sections"
    }
    case "toggle": {
      return "⏎ toggle · ctrl+s save · esc sections"
    }
    default: {
      return "esc sections"
    }
  }
}

export { arrowDelta, contentHint, cycleRow, isActivatable }
