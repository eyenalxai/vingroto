import type { MouseEvent, ScrollBoxRenderable } from "@opentui/core"

import { MouseButton } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"

import type { MessageDetail } from "@/lib/store/messages"

import { addressList, formatBytes, formatMessageDateTime, htmlToText } from "@/lib/format"
import { splitLinks } from "@/lib/link"
import { theme } from "@/lib/theme"

type BodyState =
  | { readonly _tag: "loading" }
  | { readonly _tag: "error"; readonly message: string }
  | { readonly _tag: "loaded"; readonly text: string | null; readonly html: string | null }

interface HeaderLine {
  readonly label: string
  readonly value: string
}

interface MessageViewProps {
  readonly detail: MessageDetail | undefined
  readonly body: BodyState | undefined
  readonly focused: boolean
  readonly accountLabels: ReadonlyMap<string, string>
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
  if (state.text !== null && state.text.trim().length > 0) {
    return state.text
  }
  if (state.html !== null) {
    const converted = htmlToText(state.html)
    if (converted.length > 0) {
      return converted
    }
  }
  return "(this message has no readable text body)"
}

const senderValue = (detail: MessageDetail): string => {
  if (detail.fromAddress === null) {
    return detail.fromName ?? "(unknown sender)"
  }
  if (detail.fromName === null || detail.fromName.length === 0) {
    return detail.fromAddress
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
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()

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
      { label: "Folder", value: `${account} · ${detail.mailboxName}` },
      { label: "Flags", value: flagsValue(detail) },
    ]
  })

  const bodySegments = createMemo(() => splitLinks(messageBodyText(props.body)))

  const handleBodyMouseDown = (event: MouseEvent) => {
    if (event.button !== leftMouseButton) {
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
          <box paddingLeft={1} paddingRight={1}>
            <text fg={theme.muted}>no message selected</text>
          </box>
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
              <text fg={theme.text} wrapMode="word" onMouseDown={handleBodyMouseDown}>
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
            </scrollbox>
          </box>
        )}
      </Show>
    </box>
  )
}

export { MessageView, type BodyState, type MessageViewProps }
