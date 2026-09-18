import type { ScrollBoxRenderable } from "@opentui/core"

import { For, Show, createEffect, createSignal } from "solid-js"

import type { MailboxTreeRow } from "@/lib/mail/mailbox-tree"

import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"
import { truncate } from "@/lib/format"

interface MailboxPaneProps {
  readonly rows: readonly MailboxTreeRow[]
  readonly selectedKey: string | undefined
  readonly focused: boolean
  readonly loading: boolean
  readonly syncingIds: ReadonlySet<number>
  readonly mutingIds: ReadonlySet<number>
}

const rowId = (key: string) => `mailbox-row-${key.replaceAll(":", "-")}`

const badgeLabel = (count: number | undefined) => {
  if (count === undefined || count === 0) {
    return ""
  }
  return String(count)
}

const MailboxPane = (props: MailboxPaneProps) => {
  const theme = useTheme()
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()

  const virtualRows = () => props.rows.filter((row) => row.kind === "global")
  const treeRows = () => props.rows.filter((row) => row.kind !== "global")

  const mailboxBusy = (row: MailboxTreeRow) => {
    if (row.mailboxId === undefined) {
      return false
    }
    return props.syncingIds.has(row.mailboxId) || props.mutingIds.has(row.mailboxId)
  }

  const accountBusy = (accountId: string) =>
    props.rows.some((row) => row.accountId === accountId && mailboxBusy(row))

  const badgeColor = (row: MailboxTreeRow, selected: boolean) => {
    if (selected) {
      return theme.selectionForeground
    }
    return row.tone === "unread" ? theme.unread : theme.muted
  }

  const textColor = (row: MailboxTreeRow, selected: boolean) => {
    if (selected) {
      return theme.selectionForeground
    }
    if (row.muted) {
      return theme.muted
    }
    return row.kind === "account" ? theme.accent : theme.text
  }

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
        <Show when={props.loading}>
          <Spinner label="loading mailboxes…" />
        </Show>
        <For each={virtualRows()}>
          {(row) => {
            const isSelected = () => row.key === props.selectedKey
            return (
              <box
                id={rowId(row.key)}
                flexDirection="row"
                gap={1}
                {...(isSelected() ? { backgroundColor: theme.selectionBackground } : {})}
              >
                <box flexGrow={1}>
                  <text fg={isSelected() ? theme.selectionForeground : theme.text}>
                    {truncate(row.label, 24)}
                  </text>
                </box>
                <text fg={badgeColor(row, isSelected())}>{badgeLabel(row.count)}</text>
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
            return (
              <box
                id={rowId(row.key)}
                flexDirection="row"
                gap={1}
                paddingLeft={row.indented ? 2 : 0}
                {...(isSelected() ? { backgroundColor: theme.selectionBackground } : {})}
              >
                <box flexGrow={1} flexDirection="row" gap={1}>
                  <Show
                    when={mailboxBusy(row)}
                    fallback={
                      <Show when={row.marker !== ""}>
                        <text fg={textColor(row, isSelected())}>{row.marker}</text>
                      </Show>
                    }
                  >
                    <Spinner color={isSelected() ? theme.selectionForeground : theme.accent} />
                  </Show>
                  <text fg={textColor(row, isSelected())}>{truncate(row.label, 20)}</text>
                </box>
                <Show
                  when={
                    row.kind === "account" &&
                    row.accountId !== undefined &&
                    accountBusy(row.accountId)
                  }
                  fallback={<text fg={badgeColor(row, isSelected())}>{badgeLabel(row.count)}</text>}
                >
                  <Spinner color={badgeColor(row, isSelected())} />
                </Show>
              </box>
            )
          }}
        </For>
      </scrollbox>
    </box>
  )
}

export { MailboxPane, type MailboxPaneProps }
