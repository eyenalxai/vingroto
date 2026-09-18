import { For, Show } from "solid-js"

import type { MailboxRow } from "@/lib/store/mailboxes"
import type { MailboxCounts } from "@/lib/store/messages"

import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"

interface FolderDetailProps {
  readonly mailbox: MailboxRow
  readonly accountLabel: string
  readonly counts: MailboxCounts | undefined
  readonly muting: boolean
}

const labelWidth = 15

const FolderDetail = (props: FolderDetailProps) => {
  const theme = useTheme()
  const rows = () =>
    [
      { label: "Account", value: props.accountLabel },
      { label: "Folder", value: props.mailbox.name },
      { label: "Path", value: props.mailbox.path },
      { label: "Special use", value: props.mailbox.special_use ?? "none" },
      { label: "Messages", value: String(props.counts?.total ?? 0) },
      {
        label: "Unread",
        value: props.mailbox.muted ? "not counted" : String(props.counts?.unread ?? 0),
      },
    ] as const

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      gap={1}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
    >
      <For each={rows()}>
        {(row) => (
          <box flexDirection="row" gap={1}>
            <box width={labelWidth} flexShrink={0}>
              <text fg={theme.muted} wrapMode="none" truncate>
                {row.label}
              </text>
            </box>
            <text fg={theme.text} wrapMode="none" truncate>
              {row.value}
            </text>
          </box>
        )}
      </For>
      <box flexDirection="row" gap={1}>
        <box width={labelWidth} flexShrink={0}>
          <text fg={theme.muted}>Muted</text>
        </box>
        <Show
          when={props.muting}
          fallback={
            <Show when={props.mailbox.muted} fallback={<text fg={theme.muted}>no</text>}>
              <text fg={theme.unread}>yes · excluded from unread counts</text>
            </Show>
          }
        >
          <Spinner />
        </Show>
      </box>
      <text fg={theme.muted}>⏎ toggle mute · esc back</text>
    </box>
  )
}

export { FolderDetail, type FolderDetailProps }
