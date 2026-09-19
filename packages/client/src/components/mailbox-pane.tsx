import type { ScrollBoxRenderable } from "@opentui/core"
import type { AccountId, MailboxId } from "@vingroto/core/ids"

import { For, Show, createEffect, createSignal } from "solid-js"

import type { MailboxTreeRow } from "@/lib/mail/mailbox-tree"

import { Divider } from "@/components/divider"
import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"

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

interface ViewRowProps {
  readonly row: MailboxTreeRow
  readonly selected: boolean
}

const ViewRow = (props: ViewRowProps) => {
  const theme = useTheme()
  const labelColor = () => (props.selected ? theme.selectionForeground : theme.text)
  const badgeColor = () => {
    if (props.selected) {
      return theme.selectionForeground
    }
    return props.row.countTone === "attention" ? theme.unread : theme.muted
  }
  return (
    <box
      id={rowId(props.row.key)}
      flexDirection="row"
      gap={1}
      backgroundColor={props.selected ? theme.selectionBackground : "transparent"}
    >
      <box flexGrow={1} overflow="hidden">
        <text fg={labelColor()} wrapMode="none" truncate>
          {props.row.label}
        </text>
      </box>
      <box width={countSlotWidth} flexDirection="row" justifyContent="flex-end">
        <text fg={badgeColor()}>{badgeLabel(props.row.count)}</text>
      </box>
    </box>
  )
}

interface TreeRowProps {
  readonly row: MailboxTreeRow
  readonly selected: boolean
  readonly busy: boolean
  readonly badgeBusy: boolean
}

const TreeRow = (props: TreeRowProps) => {
  const theme = useTheme()
  const markerColor = () => (props.selected ? theme.selectionForeground : theme.muted)
  const labelColor = () => {
    if (props.selected) {
      return theme.selectionForeground
    }
    if (props.row.muted) {
      return theme.muted
    }
    return props.row.kind === "account" ? theme.accent : theme.text
  }
  const badgeColor = () => {
    if (props.selected) {
      return theme.selectionForeground
    }
    return props.row.countTone === "attention" ? theme.unread : theme.muted
  }
  const spinnerColor = () => (props.selected ? theme.selectionForeground : theme.accent)
  return (
    <box
      id={rowId(props.row.key)}
      flexDirection="row"
      gap={1}
      paddingLeft={props.row.indented ? 2 : 0}
      backgroundColor={props.selected ? theme.selectionBackground : "transparent"}
    >
      <box width={1} flexShrink={0}>
        <Show when={props.busy} fallback={<text fg={markerColor()}>{props.row.marker}</text>}>
          <Spinner color={spinnerColor()} />
        </Show>
      </box>
      <box flexGrow={1} overflow="hidden">
        <text fg={labelColor()} wrapMode="none" truncate>
          {props.row.label}
        </text>
      </box>
      <box width={countSlotWidth} flexDirection="row" justifyContent="flex-end">
        <Show
          when={props.badgeBusy}
          fallback={<text fg={badgeColor()}>{badgeLabel(props.row.count)}</text>}
        >
          <Spinner color={badgeColor()} />
        </Show>
      </box>
    </box>
  )
}

const MailboxPane = (props: MailboxPaneProps) => {
  const theme = useTheme()
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()

  const mailRows = () => props.rows.filter((row) => row.kind === "global")
  const viewRows = () => props.rows.filter((row) => row.kind === "outbox" || row.kind === "drafts")
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
        <For each={mailRows()}>
          {(row) => <ViewRow row={row} selected={row.key === props.selectedKey} />}
        </For>
        <box height={1} flexShrink={0} />
        <For each={viewRows()}>
          {(row) => <ViewRow row={row} selected={row.key === props.selectedKey} />}
        </For>
        <box height={1} flexShrink={0} />
        <Divider />
        <For each={treeRows()}>
          {(row) => (
            <TreeRow
              row={row}
              selected={row.key === props.selectedKey}
              busy={mailboxBusy(row)}
              badgeBusy={
                row.kind === "account" && row.accountId !== undefined && accountBusy(row.accountId)
              }
            />
          )}
        </For>
      </scrollbox>
    </box>
  )
}

export { MailboxPane, type MailboxPaneProps }
