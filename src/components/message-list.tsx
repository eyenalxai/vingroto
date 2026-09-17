import type { ScrollBoxRenderable } from "@opentui/core"

import { For, Show, createEffect, createSignal } from "solid-js"

import type { MessageListItem } from "@/lib/store/messages"

import { useTheme } from "@/components/theme-provider"
import { formatMessageDate, senderLabel } from "@/lib/format"

interface MessageListProps {
  readonly title: string
  readonly messages: readonly MessageListItem[]
  readonly selectedId: number | undefined
  readonly focused: boolean
}

const senderColumnWidth = 18
const senderMinimumWidth = 8
const subjectMinimumWidth = 10

const MessageList = (props: MessageListProps) => {
  const theme = useTheme()
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
        <Show when={props.messages.length === 0}>
          <text fg={theme.muted} wrapMode="none" truncate>
            no messages
          </text>
        </Show>
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
                <box width={1} flexShrink={0}>
                  <text fg={isSelected() ? theme.selectionForeground : theme.accent}>
                    {message.seen ? " " : "•"}
                  </text>
                </box>
                <box
                  width={senderColumnWidth}
                  minWidth={senderMinimumWidth}
                  flexShrink={1}
                  overflow="hidden"
                >
                  <text fg={rowColor()} wrapMode="none" truncate>
                    {senderLabel(message.fromName, message.fromAddress)}
                  </text>
                </box>
                <box
                  flexBasis={0}
                  flexGrow={1}
                  minWidth={subjectMinimumWidth}
                  flexShrink={1}
                  overflow="hidden"
                >
                  <text fg={rowColor()} wrapMode="none" truncate>
                    {subject()}
                  </text>
                </box>
                <box flexShrink={0}>
                  <text fg={isSelected() ? theme.selectionForeground : theme.muted} wrapMode="none">
                    {formatMessageDate(message.date)}
                  </text>
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
