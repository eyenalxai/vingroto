import type { ScrollBoxRenderable } from "@opentui/core"
import type { Mailbox } from "@vingroto/core/protocol/mail"

import { useKeyboard, useRenderer } from "@opentui/solid"
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"

import { useTheme } from "@/components/theme-provider"
import { matchesQuery } from "@/lib/search"

interface MovePickerProps {
  readonly accountLabel: string
  readonly mailboxes: readonly Mailbox[]
  readonly onCancel: () => void
  readonly onSelect: (mailbox: Mailbox) => void
}

const rowId = (mailboxId: number) => `move-row-${mailboxId}`

const MovePicker = (props: MovePickerProps) => {
  const theme = useTheme()
  const renderer = useRenderer()
  const [query, setQuery] = createSignal("")
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()

  const mailboxes = createMemo(() =>
    props.mailboxes.toSorted((left, right) => left.path.localeCompare(right.path)),
  )

  const filtered = createMemo(() =>
    mailboxes().filter((mailbox) =>
      matchesQuery(`${mailbox.path} ${mailbox.name} ${mailbox.special_use ?? ""}`, query()),
    ),
  )

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
    if (event.ctrl && event.name === "c") {
      event.preventDefault()
      renderer.destroy()
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
        width={64}
        height="70%"
        flexDirection="column"
        border
        borderColor={theme.accent}
        title={`move to · ${props.accountLabel}`}
        titleColor={theme.accent}
        paddingLeft={1}
        paddingRight={1}
      >
        <box flexShrink={0}>
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
        <scrollbox
          ref={(box) => {
            setScrollBox(box)
          }}
          flexGrow={1}
          paddingLeft={1}
          paddingRight={1}
        >
          <Show when={filtered().length === 0}>
            <text fg={theme.muted} wrapMode="none" truncate>
              no mailbox matches
            </text>
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
                  <text
                    fg={isSelected() ? theme.selectionForeground : theme.text}
                    wrapMode="none"
                    truncate
                    flexGrow={1}
                  >
                    {mailbox.path}
                  </text>
                  <text
                    fg={isSelected() ? theme.selectionForeground : theme.muted}
                    wrapMode="none"
                    truncate
                    flexShrink={0}
                  >
                    {mailbox.name === mailbox.path ? "" : mailbox.name}
                  </text>
                </box>
              )
            }}
          </For>
        </scrollbox>
        <box flexShrink={0} paddingLeft={1} paddingRight={1}>
          <text fg={theme.muted} wrapMode="none" truncate>
            ↑↓ move · ⏎ move here · esc cancel
          </text>
        </box>
      </box>
    </box>
  )
}

export { MovePicker, type MovePickerProps }
