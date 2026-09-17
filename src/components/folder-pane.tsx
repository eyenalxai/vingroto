import type { ScrollBoxRenderable } from "@opentui/core"

import { For, Show, createEffect, createSignal } from "solid-js"

import type { FolderRow } from "@/lib/mail/folders"

import { truncate } from "@/lib/format"
import { theme } from "@/lib/theme"

interface FolderPaneProps {
  readonly rows: readonly FolderRow[]
  readonly selectedKey: string | undefined
  readonly focused: boolean
}

const rowId = (key: string) => `folder-row-${key.replaceAll(":", "-")}`

const badgeLabel = (count: number | undefined) => {
  if (count === undefined || count === 0) {
    return ""
  }
  return String(count)
}

const FolderPane = (props: FolderPaneProps) => {
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()

  const virtualRows = () => props.rows.filter((row) => row.kind === "global")
  const treeRows = () => props.rows.filter((row) => row.kind !== "global")

  createEffect(() => {
    const box = scrollBox()
    const selected = props.selectedKey
    if (box !== undefined && selected !== undefined) {
      box.scrollChildIntoView(rowId(selected))
    }
  })

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      border
      borderColor={props.focused ? theme.accent : theme.border}
      title="mailboxes"
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
        <For each={virtualRows()}>
          {(row) => {
            const isSelected = () => row.key === props.selectedKey
            return (
              <box
                id={rowId(row.key)}
                flexDirection="row"
                gap={1}
                backgroundColor={isSelected() ? theme.selectionBackground : undefined}
              >
                <box flexGrow={1}>
                  <text fg={isSelected() ? theme.selectionForeground : theme.text}>
                    {truncate(row.label, 24)}
                  </text>
                </box>
                <text
                  fg={
                    isSelected()
                      ? theme.selectionForeground
                      : row.tone === "unread"
                        ? theme.unread
                        : theme.muted
                  }
                >
                  {badgeLabel(row.count)}
                </text>
              </box>
            )
          }}
        </For>
        <box height={1}>
          <text fg={theme.border}>{"─".repeat(80)}</text>
        </box>
        <For each={treeRows()}>
          {(row) => {
            const isSelected = () => row.key === props.selectedKey
            const textColor = () => {
              if (isSelected()) {
                return theme.selectionForeground
              }
              return row.kind === "account" ? theme.accent : theme.text
            }
            return (
              <box
                id={rowId(row.key)}
                flexDirection="row"
                gap={1}
                paddingLeft={row.indented ? 2 : 0}
                backgroundColor={isSelected() ? theme.selectionBackground : undefined}
              >
                <box flexGrow={1} flexDirection="row" gap={1}>
                  <Show when={row.marker !== ""}>
                    <text fg={textColor()}>{row.marker}</text>
                  </Show>
                  <text fg={textColor()}>{truncate(row.label, 20)}</text>
                </box>
                <text
                  fg={
                    isSelected()
                      ? theme.selectionForeground
                      : row.tone === "unread"
                        ? theme.unread
                        : theme.muted
                  }
                >
                  {badgeLabel(row.count)}
                </text>
              </box>
            )
          }}
        </For>
      </scrollbox>
    </box>
  )
}

export { FolderPane, type FolderPaneProps }
