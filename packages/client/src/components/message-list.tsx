import type { ScrollBoxRenderable } from "@opentui/core"
import type { MessageId } from "@vingroto/core/ids"
import type { MessageListItem } from "@vingroto/core/protocol/mail"

import { For, Show, createEffect, createSignal } from "solid-js"

import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"
import { formatMessageDate, senderLabel } from "@/lib/format"

interface MessageListProps {
  readonly title: string
  readonly messages: readonly MessageListItem[]
  readonly selectedId: MessageId | undefined
  readonly marked: ReadonlySet<MessageId>
  readonly pending: ReadonlySet<MessageId>
  readonly loading: boolean
  readonly focused: boolean
  readonly searchActive: boolean
  readonly searchEditing: boolean
  readonly searchQuery: string
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
      <Show when={props.searchEditing || props.searchActive}>
        <box paddingLeft={1} paddingRight={1} flexShrink={0}>
          <text fg={props.searchEditing ? theme.accent : theme.muted} wrapMode="char">
            {`/ ${props.searchQuery}${props.searchEditing ? "▌" : ""}`}
          </text>
        </box>
      </Show>
      <scrollbox
        ref={(box) => {
          setScrollBox(box)
        }}
        flexGrow={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Show when={props.messages.length === 0}>
          <Show
            when={props.loading}
            fallback={
              <text fg={theme.muted}>{props.searchActive ? "no matches" : "no messages"}</text>
            }
          >
            <Spinner label="loading messages…" />
          </Show>
        </Show>
        <For each={props.messages}>
          {(message) => {
            const isSelected = () => message.id === props.selectedId
            const isMarked = () => props.marked.has(message.id)
            const rowColor = () => {
              if (isSelected()) {
                return theme.selectionForeground
              }
              return message.seen ? theme.muted : theme.text
            }
            const marker = () => {
              if (isMarked()) {
                return "✓"
              }
              return message.seen ? " " : "•"
            }
            const subject = () => message.subject ?? "(no subject)"
            return (
              <box
                id={`message-row-${message.id}`}
                flexDirection="row"
                gap={1}
                backgroundColor={isSelected() ? theme.selectionBackground : "transparent"}
              >
                <box width={1} flexShrink={0}>
                  <Show
                    when={props.pending.has(message.id)}
                    fallback={
                      <text fg={isSelected() ? theme.selectionForeground : theme.accent}>
                        {marker()}
                      </text>
                    }
                  >
                    <Spinner color={isSelected() ? theme.selectionForeground : theme.accent} />
                  </Show>
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
