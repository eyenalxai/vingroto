import type { Mailbox, MailboxCounts } from "@vingroto/core/protocol/mail"

import { For, Show } from "solid-js"

import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"

interface MailboxDetailProps {
  readonly mailbox: Mailbox
  readonly accountLabel: string
  readonly counts: MailboxCounts | undefined
  readonly muting: boolean
}

const labelWidth = 15

const MailboxDetail = (props: MailboxDetailProps) => {
  const theme = useTheme()
  const rows = () =>
    [
      { label: "Account", value: props.accountLabel },
      { label: "Mailbox", value: props.mailbox.name },
      { label: "Path", value: props.mailbox.path },
      { label: "Special use", value: props.mailbox.special_use ?? "none" },
      { label: "Messages", value: String(props.counts?.total ?? 0) },
      { label: "Unread", value: String(props.counts?.unread ?? 0) },
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
              <text fg={theme.unread}>yes · kept out of the Unread views</text>
            </Show>
          }
        >
          <Spinner />
        </Show>
      </box>
      <text fg={theme.muted}>⏎ toggle mute · esc close</text>
    </box>
  )
}

export { MailboxDetail, type MailboxDetailProps }
