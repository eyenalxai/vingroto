import type { AccountConfig, NotificationsConfig } from "@vingroto/core/config/schema"
import type { MailboxId } from "@vingroto/core/ids"
import type { Mailbox, MailboxCounts } from "@vingroto/core/protocol/mail"

import { Show } from "solid-js"

import type { SettingsEntry } from "@/components/settings/settings-entries"
import type { useAccountProfile } from "@/components/settings/use-account-profile"
import type { useSendProfile } from "@/components/settings/use-send-profile"
import type { useSyncProfile } from "@/components/settings/use-sync-profile"

import { MailboxDetail } from "@/components/settings/mailbox-detail"
import { SettingsForm } from "@/components/settings/settings-form"
import { sendFields } from "@/components/settings/use-send-profile"
import { syncFields } from "@/components/settings/use-sync-profile"
import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"

interface SettingsDetailProps {
  readonly entry: SettingsEntry | undefined
  readonly zone: "nav" | "detail"
  readonly account: AccountConfig | undefined
  readonly mailbox: Mailbox | undefined
  readonly accountLabel: string
  readonly counts: ReadonlyMap<MailboxId, MailboxCounts>
  readonly accountProfile: ReturnType<typeof useAccountProfile>
  readonly syncProfile: ReturnType<typeof useSyncProfile>
  readonly sendProfile: ReturnType<typeof useSendProfile>
  readonly mutingIds: ReadonlySet<MailboxId>
  readonly notifications: NotificationsConfig | undefined
  readonly notificationsSaving: boolean
}

const SettingsDetail = (props: SettingsDetailProps) => {
  const theme = useTheme()
  return (
    <box
      flexGrow={1}
      flexDirection="column"
      border
      borderColor={theme.accent}
      title={props.entry?.title ?? "settings"}
      titleColor={theme.accent}
    >
      <Show when={props.account}>
        {(account) => (
          <SettingsForm
            fields={props.accountProfile.fields}
            focusedId={props.accountProfile.focusedField()?.id}
            active={props.zone === "detail"}
            valueOf={props.accountProfile.fieldValue}
            onInput={props.accountProfile.input}
            storedSecretOf={(id) => id === "password"}
            pending={props.accountProfile.busy()}
            fieldPending={(id) => props.accountProfile.loading() && id === "username"}
            status={props.accountProfile.busy() ? "saving…" : props.accountProfile.status()}
            statusError={props.accountProfile.statusError()}
            hint="tab field · ⏎ next · ctrl+s save · esc back"
          >
            <box flexDirection="row" gap={1}>
              <box width={15} flexShrink={0}>
                <text fg={theme.muted}>Email</text>
              </box>
              <text fg={theme.muted} wrapMode="none" truncate>
                {account().email}
              </text>
            </box>
          </SettingsForm>
        )}
      </Show>
      <Show when={props.entry?.kind === "sync"}>
        <SettingsForm
          fields={syncFields}
          focusedId={props.syncProfile.focusedField()?.id}
          active={props.zone === "detail"}
          valueOf={props.syncProfile.fieldValue}
          onInput={props.syncProfile.input}
          pending={props.syncProfile.busy()}
          status={props.syncProfile.busy() ? "saving…" : props.syncProfile.status()}
          statusError={props.syncProfile.statusError()}
          hint="tab field · ⏎ next · ctrl+s save · esc back"
        />
      </Show>
      <Show when={props.entry?.kind === "send"}>
        <SettingsForm
          fields={sendFields}
          focusedId={props.sendProfile.focusedField()?.id}
          active={props.zone === "detail"}
          valueOf={props.sendProfile.fieldValue}
          onInput={props.sendProfile.input}
          pending={props.sendProfile.busy()}
          status={props.sendProfile.busy() ? "saving…" : props.sendProfile.status()}
          statusError={props.sendProfile.statusError()}
          hint="tab field · ⏎ save · ctrl+s save · esc back"
        />
      </Show>
      <Show when={props.mailbox}>
        {(mailbox) => (
          <MailboxDetail
            mailbox={mailbox()}
            accountLabel={props.accountLabel}
            counts={props.counts.get(mailbox().id)}
            muting={props.mutingIds.has(mailbox().id)}
          />
        )}
      </Show>
      <Show when={props.entry?.kind === "notifications"}>
        <box
          flexGrow={1}
          flexDirection="column"
          gap={1}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
        >
          <box flexDirection="row" gap={1}>
            <box width={15} flexShrink={0}>
              <text fg={theme.muted}>Enabled</text>
            </box>
            <Show
              when={props.notificationsSaving}
              fallback={
                <Show
                  when={props.notifications?.enabled === true}
                  fallback={<text fg={theme.muted}>no</text>}
                >
                  <text fg={theme.unread}>yes</text>
                </Show>
              }
            >
              <Spinner />
            </Show>
          </box>
          <text fg={theme.muted}>⏎ toggle · esc back</text>
        </box>
      </Show>
      <Show when={props.entry?.kind === "mailbox-group"}>
        <box
          flexGrow={1}
          flexDirection="column"
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          gap={1}
        >
          <text fg={theme.muted}>mailboxes grouped by account</text>
          <text fg={theme.muted}>⏎ toggle this group</text>
        </box>
      </Show>
      <Show when={props.entry?.kind === "add-account"}>
        <box
          flexGrow={1}
          flexDirection="column"
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          gap={1}
        >
          <text fg={theme.text}>Connect another mailbox.</text>
          <text fg={theme.muted}>⏎ start the account setup</text>
        </box>
      </Show>
    </box>
  )
}

export { SettingsDetail, type SettingsDetailProps }
