import type { ScrollBoxRenderable } from "@opentui/core"

import { For, createEffect, createSignal } from "solid-js"

import type { MailboxRow } from "@/lib/store/mailboxes"
import type { MessageRow } from "@/lib/store/messages"

import { formatMessageDate, senderLabel, truncate } from "@/lib/format"
import { theme } from "@/lib/theme"

interface MessageListProps {
  readonly mailbox: MailboxRow | undefined
  readonly messages: readonly MessageRow[]
  readonly selectedId: number | undefined
  readonly focused: boolean
}

const MessageList = (props: MessageListProps) => {
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()

  const title = () => {
    const mailbox = props.mailbox
    if (mailbox === undefined) {
      return "messages"
    }
    return `${mailbox.name} · ${props.messages.length}`
  }

  createEffect(() => {
    const box = scrollBox()
    const selected = props.selectedId
    if (box !== undefined && selected !== undefined) {
      box.scrollChildIntoView(`message-row-${selected}`)
    }
  })

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      border
      borderColor={props.focused ? theme.accent : theme.border}
      title={title()}
      titleColor={props.focused ? theme.accent : theme.muted}
    >
      <scrollbox
        ref={(box) => {
          setScrollBox(box)
        }}
        flexGrow={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <For each={props.messages}>
          {(message) => {
            const isSelected = () => message.id === props.selectedId
            const rowColor = () => {
              if (isSelected()) {
                return theme.selectionForeground
              }
              return message.seen ? theme.muted : theme.text
            }
            const subject = () => message.subject ?? "(no subject)"
            return (
              <box
                id={`message-row-${message.id}`}
                flexDirection="row"
                gap={1}
                backgroundColor={isSelected() ? theme.selectionBackground : undefined}
              >
                <text fg={rowColor()}>{message.seen ? " " : "•"}</text>
                <text fg={rowColor()}>{formatMessageDate(message.date)}</text>
                <box width={22}>
                  <text fg={rowColor()}>
                    {truncate(senderLabel(message.fromName, message.fromAddress), 20)}
                  </text>
                </box>
                <box flexGrow={1}>
                  <text fg={rowColor()}>{truncate(subject(), 120)}</text>
                </box>
              </box>
            )
          }}
        </For>
      </scrollbox>
    </box>
  )
}

export { MessageList }
