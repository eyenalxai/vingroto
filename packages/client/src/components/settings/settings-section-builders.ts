import type { AccountConfig } from "@vingroto/core/config/schema"
import type { MailboxId } from "@vingroto/core/ids"
import type { Mailbox, MailboxCounts } from "@vingroto/core/protocol/mail"

import type {
  SettingsGroup,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-rows"
import type { useEditorSetting } from "@/components/settings/use-editor-setting"
import type { useNotificationsSetting } from "@/components/settings/use-notifications-setting"
import type { useSendProfile } from "@/components/settings/use-send-profile"
import type { SettingsExpansion } from "@/components/settings/use-settings-expansion"
import type { useSyncProfile } from "@/components/settings/use-sync-profile"
import type { useMailboxMute } from "@/components/use-mailbox-mute"

import { sendFields } from "@/components/settings/use-send-profile"
import { syncFields } from "@/components/settings/use-sync-profile"
import { describeSystemEditor } from "@/lib/external"

interface MailboxSectionInput {
  readonly accounts: () => readonly AccountConfig[]
  readonly mailboxes: () => readonly Mailbox[]
  readonly counts: () => ReadonlyMap<MailboxId, MailboxCounts>
  readonly mailboxMute: ReturnType<typeof useMailboxMute>
  readonly expansion: SettingsExpansion
}

interface ComposerSectionInput {
  readonly editorSetting: ReturnType<typeof useEditorSetting>
}

interface SendingSectionInput {
  readonly sendProfile: ReturnType<typeof useSendProfile>
}

interface SyncSectionInput {
  readonly syncProfile: ReturnType<typeof useSyncProfile>
}

interface NotificationsSectionInput {
  readonly notificationsSetting: ReturnType<typeof useNotificationsSetting>
}

const mailboxGroup = (account: AccountConfig, input: MailboxSectionInput): SettingsGroup => {
  const mailboxes = input
    .mailboxes()
    .filter((mailbox) => mailbox.account_id === account.id && mailbox.selectable)
    .toSorted((left, right) => left.path.localeCompare(right.path))
  const groupKey = `mailboxes:${account.id}`
  const unreadTotal = () => {
    let total = 0
    for (const mailbox of mailboxes) {
      total += input.counts().get(mailbox.id)?.unread ?? 0
    }
    return total
  }
  return {
    kind: "mailboxes",
    key: groupKey,
    title: () => account.label,
    summary: () => {
      const count = mailboxes.length
      const label = count === 1 ? "1 mailbox" : `${count} mailboxes`
      const unread = unreadTotal()
      return unread === 0 ? label : `${label} · ${unread} unread`
    },
    note: "no mailboxes synced yet",
    expanded: () => input.expansion.isExpanded(groupKey),
    toggle: () => {
      input.expansion.toggle(groupKey)
    },
    rows: mailboxes.map((mailbox): SettingsRow => {
      return {
        kind: "mailbox",
        key: `mailbox:${mailbox.id}`,
        name: mailbox.name,
        path: mailbox.path,
        unread: () => input.counts().get(mailbox.id)?.unread ?? 0,
        muted: mailbox.muted,
        pending: () => input.mailboxMute.mutingIds().has(mailbox.id),
        toggle: () => {
          input.mailboxMute.toggleMute(mailbox.id, mailbox.name, mailbox.muted)
        },
      }
    }),
  }
}

const buildMailboxSection = (input: MailboxSectionInput): SettingsSection => {
  return {
    key: "mailboxes",
    title: "Mailboxes",
    groups: input.accounts().map((account) => mailboxGroup(account, input)),
    rows: [],
  }
}

const buildComposerSection = (input: ComposerSectionInput): SettingsSection => {
  const systemEditor = describeSystemEditor()
  return {
    key: "composer",
    title: "Composer",
    dirty: () => input.editorSetting.dirty(),
    groups: [],
    rows: [
      {
        kind: "choice",
        key: "editor",
        label: "Editor",
        value: () =>
          input.editorSetting.value() === "system" ? `system (${systemEditor})` : "builtin",
        cycle: (delta) => {
          input.editorSetting.cycle(delta)
        },
        save: () => {
          input.editorSetting.save()
        },
      },
    ],
  }
}

const buildSendingSection = (input: SendingSectionInput): SettingsSection => {
  const rows: readonly SettingsRow[] = sendFields.map((field) => {
    return {
      kind: "text",
      key: `send:${field.id}`,
      label: field.label,
      value: () => input.sendProfile.value(field.id),
      input: (next) => {
        input.sendProfile.input(field.id, next)
      },
      placeholder: field.placeholder,
      save: () => {
        input.sendProfile.save()
      },
    }
  })
  return {
    key: "sending",
    title: "Sending",
    dirty: () => input.sendProfile.dirty(),
    groups: [],
    rows,
  }
}

const buildSyncSection = (input: SyncSectionInput): SettingsSection => {
  const rows: readonly SettingsRow[] = syncFields.map((field) => {
    return {
      kind: "text",
      key: `sync:${field.id}`,
      label: field.label,
      value: () => input.syncProfile.value(field.id),
      input: (next) => {
        input.syncProfile.input(field.id, next)
      },
      placeholder: field.placeholder,
      save: () => {
        input.syncProfile.save()
      },
    }
  })
  return {
    key: "sync",
    title: "Sync",
    dirty: () => input.syncProfile.dirty(),
    groups: [],
    rows,
  }
}

const buildNotificationsSection = (input: NotificationsSectionInput): SettingsSection => {
  return {
    key: "notifications",
    title: "Notifications",
    dirty: () => input.notificationsSetting.dirty(),
    groups: [],
    rows: [
      {
        kind: "toggle",
        key: "notifications",
        label: "Enabled",
        value: () => input.notificationsSetting.value(),
        toggle: () => {
          input.notificationsSetting.toggle()
        },
        pending: () => input.notificationsSetting.saving(),
      },
    ],
  }
}

export {
  buildComposerSection,
  buildMailboxSection,
  buildNotificationsSection,
  buildSendingSection,
  buildSyncSection,
}
