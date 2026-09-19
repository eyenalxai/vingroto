import type { ScrollBoxRenderable } from "@opentui/core"
import type { AccountId, MailboxId } from "@vingroto/core/ids"

import { For, Show, createEffect, createSignal } from "solid-js"

import type { MailboxTreeRow } from "@/lib/mail/mailbox-tree"

import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"
import { truncate } from "@/lib/format"

interface MailboxPaneProps {
  readonly rows: readonly MailboxTreeRow[]
  readonly selectedKey: string | undefined
  readonly focused: boolean
  readonly syncingIds: ReadonlySet<MailboxId>
  readonly mutingIds: ReadonlySet<MailboxId>
}

const rowId = (key: string) => `mailbox-row-${key.replaceAll(":", "-")}`

const countSlotWidth = 3

const badgeLabel = (count: number | undefined) => {
  if (count === undefined || count === 0) {
    return ""
  }
  return String(count)
}

const MailboxPane = (props: MailboxPaneProps) => {
  const theme = useTheme()
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()

  const virtualRows = () =>
    props.rows.filter(
      (row) => row.kind === "global" || row.kind === "outbox" || row.kind === "drafts",
    )
  const treeRows = () =>
    props.rows.filter(
      (row) => row.kind === "account" || row.kind === "unread" || row.kind === "mailbox",
    )

  const mailboxBusy = (row: MailboxTreeRow) => {
    if (row.mailboxId === undefined) {
      return false
    }
    return props.syncingIds.has(row.mailboxId) || props.mutingIds.has(row.mailboxId)
  }

  const accountBusy = (accountId: AccountId) =>
    props.rows.some((row) => row.accountId === accountId && mailboxBusy(row))

  const badgeColor = (row: MailboxTreeRow, selected: boolean) => {
    if (selected) {
      return theme.selectionForeground
    }
    return row.countTone === "attention" ? theme.unread : theme.muted
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
        <For each={virtualRows()}>
          {(row) => {
            const isSelected = () => row.key === props.selectedKey
            return (
              <box
                id={rowId(row.key)}
                flexDirection="row"
                gap={1}
                backgroundColor={isSelected() ? theme.selectionBackground : "transparent"}
              >
                <box flexGrow={1}>
                  <text fg={isSelected() ? theme.selectionForeground : theme.text}>
                    {truncate(row.label, 24)}
                  </text>
                </box>
                <box width={countSlotWidth} flexDirection="row" justifyContent="flex-end">
                  <text fg={badgeColor(row, isSelected())}>{badgeLabel(row.count)}</text>
                </box>
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
                backgroundColor={isSelected() ? theme.selectionBackground : "transparent"}
              >
                <box width={1} flexShrink={0}>
                  <Show
                    when={mailboxBusy(row)}
                    fallback={<text fg={textColor(row, isSelected())}>{row.marker}</text>}
                  >
                    <Spinner color={isSelected() ? theme.selectionForeground : theme.accent} />
                  </Show>
                </box>
                <box flexGrow={1}>
                  <text fg={textColor(row, isSelected())}>{truncate(row.label, 20)}</text>
                </box>
                <box width={countSlotWidth} flexDirection="row" justifyContent="flex-end">
                  <Show
                    when={
                      row.kind === "account" &&
                      row.accountId !== undefined &&
                      accountBusy(row.accountId)
                    }
                    fallback={
                      <text fg={badgeColor(row, isSelected())}>{badgeLabel(row.count)}</text>
                    }
                  >
                    <Spinner color={badgeColor(row, isSelected())} />
                  </Show>
                </box>
              </box>
            )
          }}
        </For>
      </scrollbox>
    </box>
  )
}

export { MailboxPane, type MailboxPaneProps }
