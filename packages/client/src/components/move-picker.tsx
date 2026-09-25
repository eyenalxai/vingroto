import type { ScrollBoxRenderable } from "@opentui/core"
import type { MailboxId } from "@vingroto/core/ids"
import type { Mailbox } from "@vingroto/core/protocol/mail"

import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"

import { Divider } from "@/components/divider"
import { handleQuitKey } from "@/components/quit-key"
import { StatusBar } from "@/components/status-bar"
import { useTheme } from "@/components/theme-provider"
import { matchesQuery } from "@/lib/search"

interface MovePickerProps {
  readonly accountLabel: string
  readonly mailboxes: readonly Mailbox[]
  readonly onCancel: () => void
  readonly onSelect: (mailbox: Mailbox) => void
}

const rowId = (mailboxId: MailboxId) => `move-row-${mailboxId}`

const panelPreferredWidth = 64

const MovePicker = (props: MovePickerProps) => {
  const theme = useTheme()
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const [query, setQuery] = createSignal("")
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()

  const mailboxes = createMemo(() =>
    props.mailboxes.toSorted((left, right) => left.path.localeCompare(right.path)),
  )

  const filtered = createMemo(() =>
    mailboxes().filter((mailbox) =>
      matchesQuery(`${mailbox.path} ${mailbox.name} ${mailbox.specialUse ?? ""}`, query()),
    ),
  )

  const panelWidth = () => Math.min(panelPreferredWidth, Math.max(1, dimensions().width - 4))
  const emptyLabel = () => (query().length === 0 ? "no mailboxes synced yet" : "no mailbox matches")
  const countLabel = () => {
    const count = filtered().length
    return count === 1 ? "1 mailbox" : `${count} mailboxes`
  }

  createEffect(() => {
    query()
    setSelectedIndex(0)
  })

  createEffect(() => {
    const box = scrollBox()
    const row = filtered()[selectedIndex()]
    if (box !== undefined && row !== undefined) {
      box.scrollChildIntoView(rowId(row.id))
    }
  })

  const moveSelection = (delta: number) => {
    const rows = filtered()
    if (rows.length === 0) {
      return
    }
    const next = Math.min(Math.max(selectedIndex() + delta, 0), rows.length - 1)
    setSelectedIndex(next)
  }

  const confirm = () => {
    const row = filtered()[selectedIndex()]
    if (row !== undefined) {
      props.onSelect(row)
    }
  }

  useKeyboard((event) => {
    if (handleQuitKey({ renderer }, event)) {
      event.preventDefault()
      return
    }
    if (event.name === "down") {
      event.preventDefault()
      moveSelection(1)
      return
    }
    if (event.name === "up") {
      event.preventDefault()
      moveSelection(-1)
      return
    }
    if (event.name === "return") {
      event.preventDefault()
      confirm()
      return
    }
    if (event.name === "escape") {
      event.preventDefault()
      props.onCancel()
    }
  })

  return (
    <box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
      <box
        width={panelWidth()}
        height="70%"
        flexDirection="column"
        border
        borderColor={theme.accent}
        title={`move to · ${props.accountLabel}`}
        titleColor={theme.accent}
      >
        <box flexShrink={0} paddingLeft={1} paddingRight={1}>
          <input
            value={query()}
            onInput={(value) => {
              setQuery(value)
            }}
            focused
            placeholder="search mailboxes…"
            placeholderColor={theme.muted}
            textColor={theme.text}
            focusedTextColor={theme.text}
            cursorColor={theme.accent}
            flexGrow={1}
          />
        </box>
        <Divider />
        <scrollbox
          ref={(box) => {
            setScrollBox(box)
          }}
          flexGrow={1}
          paddingLeft={1}
          paddingRight={1}
        >
          <Show when={filtered().length === 0}>
            <text fg={theme.muted}>{emptyLabel()}</text>
          </Show>
          <For each={filtered()}>
            {(mailbox, index) => {
              const isSelected = () => index() === selectedIndex()
              return (
                <box
                  id={rowId(mailbox.id)}
                  flexDirection="row"
                  gap={1}
                  backgroundColor={isSelected() ? theme.selectionBackground : "transparent"}
                >
                  <box flexGrow={1} overflow="hidden">
                    <text
                      fg={isSelected() ? theme.selectionForeground : theme.text}
                      wrapMode="none"
                      truncate
                    >
                      {mailbox.path}
                    </text>
                  </box>
                  <box flexShrink={0}>
                    <text
                      fg={isSelected() ? theme.selectionForeground : theme.muted}
                      wrapMode="none"
                      truncate
                    >
                      {mailbox.name === mailbox.path ? "" : mailbox.name}
                    </text>
                  </box>
                </box>
              )
            }}
          </For>
        </scrollbox>
        <StatusBar
          message={countLabel()}
          busy={false}
          hint="↑↓ move · ⏎ move here · esc cancel · ctrl+c quit app"
        />
      </box>
    </box>
  )
}

export { MovePicker, type MovePickerProps }
