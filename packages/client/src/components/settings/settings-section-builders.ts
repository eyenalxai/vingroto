import type { AccountConfig, NotificationsConfig } from "@vingroto/core/config/schema"
import type { MailboxId } from "@vingroto/core/ids"
import type { Mailbox, MailboxCounts } from "@vingroto/core/protocol/mail"

import type {
  SettingsBlock,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-rows"
import type { useEditorSetting } from "@/components/settings/use-editor-setting"
import type { useNotificationsSetting } from "@/components/settings/use-notifications-setting"
import type { useSendProfile } from "@/components/settings/use-send-profile"
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
  readonly notifications: () => NotificationsConfig
  readonly notificationsSetting: ReturnType<typeof useNotificationsSetting>
}

const buildMailboxSection = (input: MailboxSectionInput): SettingsSection => {
  const blocks: readonly SettingsBlock[] = input.accounts().map((account) => {
    const mailboxes = input
      .mailboxes()
      .filter((mailbox) => mailbox.account_id === account.id && mailbox.selectable)
      .toSorted((left, right) => left.path.localeCompare(right.path))
    return {
      key: `mailboxes:${account.id}`,
      title: account.label,
      note: "no mailboxes synced yet",
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
  })
  return { key: "mailboxes", title: "Mailboxes", blocks }
}

const buildComposerSection = (input: ComposerSectionInput): SettingsSection => {
  const systemEditor = describeSystemEditor()
  return {
    key: "composer",
    title: "Composer",
    blocks: [
      {
        key: "composer",
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
  return { key: "sending", title: "Sending", blocks: [{ key: "sending", rows }] }
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
  return { key: "sync", title: "Sync", blocks: [{ key: "sync", rows }] }
}

const buildNotificationsSection = (input: NotificationsSectionInput): SettingsSection => {
  return {
    key: "notifications",
    title: "Notifications",
    blocks: [
      {
        key: "notifications",
        rows: [
          {
            kind: "toggle",
            key: "notifications",
            label: "Enabled",
            value: () => input.notifications().enabled,
            toggle: () => {
              input.notificationsSetting.toggle(!input.notifications().enabled)
            },
            pending: () => input.notificationsSetting.saving(),
          },
        ],
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
