import type { MouseEvent, ScrollBoxRenderable } from "@opentui/core"
import type { AccountId } from "@vingroto/core/ids"
import type { MessageDetail } from "@vingroto/core/protocol/mail"

import { MouseButton } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"

import type { BodyState } from "@/lib/mail/body-state"

import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"
import { addressList, formatBytes, formatMessageDateTime } from "@/lib/format"
import { splitLinks } from "@/lib/link"
import { renderBodyText } from "@/lib/mail/body-text"

interface HeaderLine {
  readonly label: string
  readonly value: string
}

interface MessageViewProps {
  readonly detail: MessageDetail | undefined
  readonly body: BodyState | undefined
  readonly loadingDetail: boolean
  readonly focused: boolean
  readonly accountLabels: ReadonlyMap<AccountId, string>
  readonly onScrollRef: (box: ScrollBoxRenderable) => void
  readonly onOpenLink: (url: string) => void
}

const leftMouseButton: number = MouseButton.LEFT

const messageBodyText = (state: BodyState | undefined): string => {
  if (state === undefined || state._tag === "loading") {
    return "loading message…"
  }
  if (state._tag === "error") {
    return `could not load the message\n\n${state.message}`
  }
  return renderBodyText(state.text, state.html)
}

const senderValue = (detail: MessageDetail): string => {
  if (detail.fromName === null || detail.fromName.trim().length === 0) {
    return detail.fromAddress ?? "(unknown sender)"
  }
  if (detail.fromAddress === null) {
    return detail.fromName
  }
  return `${detail.fromName} <${detail.fromAddress}>`
}

const flagsValue = (detail: MessageDetail): string => {
  const flags = [
    detail.seen ? "read" : "unread",
    detail.flagged ? "flagged" : undefined,
    detail.answered ? "answered" : undefined,
    detail.draft ? "draft" : undefined,
    detail.hasAttachments ? "attachments" : undefined,
  ].filter((flag) => flag !== undefined)
  return flags.join(" · ")
}

const MessageView = (props: MessageViewProps) => {
  const renderer = useRenderer()
  const theme = useTheme()
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()
  const [linkPress, setLinkPress] = createSignal<{ readonly x: number; readonly y: number }>()

  const headerLines = createMemo<readonly HeaderLine[]>(() => {
    const detail = props.detail
    if (detail === undefined) {
      return []
    }
    const account = props.accountLabels.get(detail.accountId) ?? detail.accountId
    const ccLine =
      (detail.cc ?? []).length === 0 ? [] : [{ label: "Cc", value: addressList(detail.cc) }]
    return [
      { label: "From", value: senderValue(detail) },
      { label: "To", value: addressList(detail.to) },
      ...ccLine,
      {
        label: "Date",
        value: `${formatMessageDateTime(detail.date)} · ${formatBytes(detail.size)}`,
      },
      { label: "Mailbox", value: `${account} · ${detail.mailboxName}` },
      { label: "Flags", value: flagsValue(detail) },
    ]
  })

  const bodySegments = createMemo(() => splitLinks(messageBodyText(props.body)))
  const bodyLoading = () => props.body === undefined || props.body._tag === "loading"

  const handleBodyMouseDown = (event: MouseEvent) => {
    if (event.button === leftMouseButton) {
      setLinkPress({ x: event.x, y: event.y })
    }
  }

  const handleBodyMouseUp = (event: MouseEvent) => {
    const press = linkPress()
    setLinkPress(undefined)
    if (event.button !== leftMouseButton || press === undefined) {
      return
    }
    if (event.x !== press.x || event.y !== press.y) {
      return
    }
    const url = renderer.getLinkAt(event.x, event.y)
    if (url !== null) {
      props.onOpenLink(url)
    }
  }

  createEffect(() => {
    const detail = props.detail
    const box = scrollBox()
    if (detail !== undefined && box !== undefined) {
      box.scrollTop = 0
    }
  })

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      border
      borderColor={props.focused ? theme.accent : theme.border}
    >
      <Show
        when={props.detail}
        fallback={
          <Show
            when={props.loadingDetail}
            fallback={
              <box paddingLeft={1} paddingRight={1}>
                <text fg={theme.muted}>no message selected</text>
              </box>
            }
          >
            <box paddingLeft={1} paddingRight={1}>
              <Spinner label="loading message…" />
            </box>
          </Show>
        }
      >
        {(detail) => (
          <box flexGrow={1} flexDirection="column">
            <box flexDirection="column" paddingLeft={1} paddingRight={1}>
              <text fg={theme.accent} wrapMode="word">
                {detail().subject ?? "(no subject)"}
              </text>
              <For each={headerLines()}>
                {(line) => (
                  <box flexDirection="row" gap={1}>
                    <box width={7}>
                      <text fg={theme.muted}>{line.label}</text>
                    </box>
                    <box flexGrow={1}>
                      <text fg={theme.text} wrapMode="word">
                        {line.value}
                      </text>
                    </box>
                  </box>
                )}
              </For>
            </box>
            <box height={1}>
              <text fg={theme.border}>{"─".repeat(200)}</text>
            </box>
            <scrollbox
              ref={(box) => {
                setScrollBox(box)
                props.onScrollRef(box)
              }}
              flexGrow={1}
              paddingLeft={1}
              paddingRight={1}
            >
              <Show
                when={bodyLoading()}
                fallback={
                  <text
                    fg={theme.text}
                    wrapMode="word"
                    onMouseDown={handleBodyMouseDown}
                    onMouseUp={handleBodyMouseUp}
                  >
                    <For each={bodySegments()}>
                      {(segment) =>
                        segment.url === undefined ? (
                          segment.text
                        ) : (
                          <a href={segment.url} style={{ fg: theme.accent, underline: true }}>
                            {segment.text}
                          </a>
                        )
                      }
                    </For>
                  </text>
                }
              >
                <Spinner label="loading message…" />
              </Show>
            </scrollbox>
          </box>
        )}
      </Show>
    </box>
  )
}

export { MessageView, type MessageViewProps }
