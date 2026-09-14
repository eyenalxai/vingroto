import type { ScrollBoxRenderable } from "@opentui/core"

import { For, Show, createEffect, createSignal } from "solid-js"

import type { MessageListItem } from "@/lib/store/messages"

import { formatMessageDate, senderLabel, truncate } from "@/lib/format"
import { theme } from "@/lib/theme"

interface MessageListProps {
  readonly title: string
  readonly messages: readonly MessageListItem[]
  readonly selectedId: number | undefined
  readonly focused: boolean
  readonly showMailbox: boolean
}

const MessageList = (props: MessageListProps) => {
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()

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
      title={props.title}
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
                <Show when={props.showMailbox}>
                  <box width={12}>
                    <text fg={rowColor()}>{truncate(message.mailboxName, 10)}</text>
                  </box>
                </Show>
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

export { MessageList, type MessageListProps }
