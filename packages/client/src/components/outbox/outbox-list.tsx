import type { ScrollBoxRenderable } from "@opentui/core"
import type { DraftId, OutboxId } from "@vingroto/core/ids"
import type { Draft, OutboxEntry } from "@vingroto/core/protocol/outgoing"

import { For, Show, createEffect, createSignal } from "solid-js"

import type { MailViewKind } from "@/lib/mail/mailbox-tree"

import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"
import { addressList, formatMessageDate } from "@/lib/format"

interface OutboxRowProps {
  readonly id: string
  readonly selected: boolean
  readonly marker: string
  readonly markerColor: string | undefined
  readonly sender: string
  readonly subject: string
  readonly countdown: string | undefined
  readonly tail: string
  readonly tailColor: string | undefined
}

interface OutboxListProps {
  readonly title: string
  readonly scope: MailViewKind
  readonly entries: readonly OutboxEntry[]
  readonly drafts: readonly Draft[]
  readonly selectedId: OutboxId | DraftId | undefined
  readonly loading: boolean
  readonly focused: boolean
  readonly countdownOf: (entry: OutboxEntry) => string
  readonly stateOf: (entry: OutboxEntry) => string
}

const senderColumnWidth = 18
const senderMinimumWidth = 8
const subjectMinimumWidth = 10
const countdownSlotWidth = 14

const rowId = (id: OutboxId | DraftId) => `outbox-row-${id}`

const OutboxRow = (props: OutboxRowProps) => {
  const theme = useTheme()
  const foreground = () => (props.selected ? theme.selectionForeground : theme.text)
  const muted = () => (props.selected ? theme.selectionForeground : theme.muted)
  return (
    <box
      id={props.id}
      flexDirection="row"
      gap={1}
      backgroundColor={props.selected ? theme.selectionBackground : "transparent"}
    >
      <box width={1} flexShrink={0}>
        <text fg={props.markerColor ?? muted()}>{props.marker}</text>
      </box>
      <box width={senderColumnWidth} minWidth={senderMinimumWidth} flexShrink={1} overflow="hidden">
        <text fg={foreground()} wrapMode="none" truncate>
          {props.sender}
        </text>
      </box>
      <box
        flexBasis={0}
        flexGrow={1}
        minWidth={subjectMinimumWidth}
        flexShrink={1}
        overflow="hidden"
      >
        <text fg={foreground()} wrapMode="none" truncate>
          {props.subject}
        </text>
      </box>
      <Show when={props.countdown}>
        {(countdown) => (
          <box
            width={countdownSlotWidth}
            flexShrink={0}
            flexDirection="row"
            justifyContent="flex-end"
            overflow="hidden"
          >
            <text fg={muted()} wrapMode="none" truncate>
              {countdown()}
            </text>
          </box>
        )}
      </Show>
      <Show when={props.tail.length > 0}>
        <box flexShrink={1} overflow="hidden">
          <text fg={props.tailColor ?? muted()} wrapMode="none" truncate>
            {props.tail}
          </text>
        </box>
      </Show>
    </box>
  )
}

const OutboxList = (props: OutboxListProps) => {
  const theme = useTheme()
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()

  const count = () => (props.scope === "drafts" ? props.drafts.length : props.entries.length)

  createEffect(() => {
    const box = scrollBox()
    const selected = props.selectedId
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
        <Show when={count() === 0}>
          <Show
            when={props.loading}
            fallback={
              <text fg={theme.muted} wrapMode="none" truncate>
                {props.scope === "drafts" ? "no drafts" : "no pending messages"}
              </text>
            }
          >
            <Spinner label={props.scope === "drafts" ? "loading drafts…" : "loading the outbox…"} />
          </Show>
        </Show>
        <Show when={props.scope === "outbox"}>
          <For each={props.entries}>
            {(entry) => (
              <OutboxRow
                id={rowId(entry.id)}
                selected={entry.id === props.selectedId}
                marker={entry.state === "failed" ? "!" : ""}
                markerColor={entry.state === "failed" ? theme.error : undefined}
                sender={addressList(entry.to)}
                subject={entry.subject.trim().length === 0 ? "(no subject)" : entry.subject}
                countdown={props.countdownOf(entry)}
                tail={props.stateOf(entry)}
                tailColor={entry.state === "failed" ? theme.error : undefined}
              />
            )}
          </For>
        </Show>
        <Show when={props.scope === "drafts"}>
          <For each={props.drafts}>
            {(draft) => (
              <OutboxRow
                id={rowId(draft.id)}
                selected={draft.id === props.selectedId}
                marker=""
                markerColor={undefined}
                sender={addressList(draft.to)}
                subject={draft.subject.trim().length === 0 ? "(no subject)" : draft.subject}
                countdown={undefined}
                tail={`updated ${formatMessageDate(draft.updatedAt)}`}
                tailColor={undefined}
              />
            )}
          </For>
        </Show>
      </scrollbox>
    </box>
  )
}

export { OutboxList, type OutboxListProps }
