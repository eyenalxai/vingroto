import type { KeyEvent } from "@opentui/core"
import type { NotificationsConfig } from "@vingroto/core/config/schema"
import type { AccountId } from "@vingroto/core/ids"
import type { Setter } from "solid-js"

import type { SettingsEntry } from "@/components/settings/settings-entries"
import type { useAccountOrder } from "@/components/settings/use-account-order"
import type { useAccountProfile } from "@/components/settings/use-account-profile"
import type { useNotificationsSetting } from "@/components/settings/use-notifications-setting"
import type { useSendProfile } from "@/components/settings/use-send-profile"
import type { useSyncProfile } from "@/components/settings/use-sync-profile"
import type { useMailboxMute } from "@/components/use-mailbox-mute"

interface UseSettingsKeysOptions {
  readonly visible: () => readonly SettingsEntry[]
  readonly selectedEntry: () => SettingsEntry | undefined
  readonly selectedKey: () => string | undefined
  readonly setSelectedKey: Setter<string | undefined>
  readonly zone: () => "nav" | "detail"
  readonly setZone: Setter<"nav" | "detail">
  readonly accountOrder: ReturnType<typeof useAccountOrder>
  readonly accountProfile: ReturnType<typeof useAccountProfile>
  readonly syncProfile: ReturnType<typeof useSyncProfile>
  readonly sendProfile: ReturnType<typeof useSendProfile>
  readonly notificationsSetting: ReturnType<typeof useNotificationsSetting>
  readonly mailboxMute: ReturnType<typeof useMailboxMute>
  readonly notifications: () => NotificationsConfig
  readonly onToggleGroup: (accountId: AccountId) => void
  readonly onAddAccount: () => void
  readonly onClose: () => void
}

const useSettingsKeys = (options: UseSettingsKeysOptions) => {
  const moveSelection = (delta: number) => {
    const rows = options.visible()
    const index = rows.findIndex((entry) => entry.key === options.selectedKey())
    const clamped = Math.min(Math.max(index === -1 ? 0 : index + delta, 0), rows.length - 1)
    const next = rows[clamped]
    if (next !== undefined) {
      options.setSelectedKey(next.key)
    }
  }

  const activateEntry = (key: string) => {
    options.setSelectedKey(key)
    const entry = options.visible().find((candidate) => candidate.key === key)
    if (entry === undefined) {
      return
    }
    if (entry.kind === "add-account") {
      options.onAddAccount()
      return
    }
    if (entry.kind === "mailbox-group") {
      options.onToggleGroup(entry.accountId)
      return
    }
    if (entry.kind === "mailbox") {
      options.mailboxMute.toggleMute(entry.mailboxId, entry.name, entry.muted)
      return
    }
    options.setZone("detail")
  }

  const handleNavKey = (event: KeyEvent): boolean => {
    if (event.name === "down" || event.name === "up") {
      event.preventDefault()
      const delta = event.name === "down" ? 1 : -1
      const entry = options.selectedEntry()
      if (event.shift && entry?.kind === "account") {
        options.accountOrder.move(entry.accountId, delta)
      } else {
        moveSelection(delta)
      }
      return true
    }
    if (event.name === "space") {
      const entry = options.selectedEntry()
      if (entry?.kind === "mailbox-group") {
        event.preventDefault()
        options.onToggleGroup(entry.accountId)
      } else if (entry?.kind === "mailbox") {
        event.preventDefault()
        options.mailboxMute.toggleMute(entry.mailboxId, entry.name, entry.muted)
      }
      return true
    }
    if (event.name === "tab" || event.name === "return") {
      event.preventDefault()
      const entry = options.selectedEntry()
      if (entry !== undefined && (event.name === "return" || entry.kind !== "add-account")) {
        activateEntry(entry.key)
      }
      return true
    }
    if (event.name === "escape") {
      event.preventDefault()
      options.onClose()
      return true
    }
    return false
  }

  const handleDetailKey = (event: KeyEvent): boolean => {
    if (event.name === "escape" || (event.name === "tab" && event.shift)) {
      event.preventDefault()
      options.setZone("nav")
      return true
    }
    const entry = options.selectedEntry()
    if (entry?.kind === "account") {
      if (options.accountProfile.handleKey(event)) {
        event.preventDefault()
      }
      return true
    }
    if (entry?.kind === "sync" || entry?.kind === "send") {
      const handled =
        entry.kind === "sync"
          ? options.syncProfile.handleKey(event)
          : options.sendProfile.handleKey(event)
      if (handled) {
        event.preventDefault()
      }
      return true
    }
    if (entry?.kind === "notifications") {
      if (event.name === "return" || event.name === "space") {
        event.preventDefault()
        options.notificationsSetting.toggle(!options.notifications().enabled)
      }
      return true
    }
    return false
  }

  const handleKey = (event: KeyEvent) => {
    if (options.zone() === "nav") {
      handleNavKey(event)
      return
    }
    handleDetailKey(event)
  }

  return { activateEntry, handleKey }
}

export { useSettingsKeys, type UseSettingsKeysOptions }
