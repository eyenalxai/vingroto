import type { KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import type { AccountConfig } from "@vingroto/core/config/schema"
import type { AccountId, DraftId, OutboxId } from "@vingroto/core/ids"
import type { Draft, OutboxEntry } from "@vingroto/core/protocol/outgoing"

import { useKeyboard, useRenderer } from "@opentui/solid"
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"

import type { AppRuntime } from "@/lib/runtime"

import { useOutbox } from "@/components/outbox/use-outbox"
import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"
import { addressList, formatMessageDateTime } from "@/lib/format"

interface OutboxScreenProps {
  readonly runtime: AppRuntime
  readonly accounts: readonly AccountConfig[]
  readonly dataVersion: () => number
  readonly onClose: () => void
  readonly onOpenDraft: (draft: Draft) => void
  readonly onDisconnected: (message: string) => void
}

const entryRowId = (id: OutboxId) => `outbox-entry-${id}`
const draftRowId = (id: DraftId) => `outbox-draft-${id}`

const attemptsLabel = (attempts: number) => `${attempts} attempt${attempts === 1 ? "" : "s"}`

interface OutboxRowProps {
  readonly id: string
  readonly title: string
  readonly account: string
  readonly detail: string
  readonly selected: boolean
  readonly detailColor?: string | undefined
}

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
      <text fg={foreground()} wrapMode="none" truncate flexGrow={1}>
        {props.title}
      </text>
      <text fg={muted()} wrapMode="none" truncate flexShrink={0}>
        {props.account}
      </text>
      <text fg={props.detailColor ?? muted()} wrapMode="none" truncate flexShrink={0}>
        {props.detail}
      </text>
    </box>
  )
}

const OutboxScreen = (props: OutboxScreenProps) => {
  const renderer = useRenderer()
  const theme = useTheme()
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()
  const outbox = useOutbox({
    dataVersion: props.dataVersion,
    onDisconnected: props.onDisconnected,
    onOpenDraft: props.onOpenDraft,
    runtime: props.runtime,
  })

  const accountLabels = createMemo<ReadonlyMap<AccountId, string>>(
    () => new Map(props.accounts.map((account) => [account.id, account.label])),
  )

  const accountLabelOf = (accountId: AccountId) => accountLabels().get(accountId) ?? accountId

  const selectedRowId = createMemo(() => {
    if (outbox.section() === "pending") {
      const entry = outbox.selectedEntry()
      return entry === undefined ? undefined : entryRowId(entry.id)
    }
    const draft = outbox.selectedDraft()
    return draft === undefined ? undefined : draftRowId(draft.id)
  })

  createEffect(() => {
    const box = scrollBox()
    const row = selectedRowId()
    if (box !== undefined && row !== undefined) {
      box.scrollChildIntoView(row)
    }
  })

  const entryDetail = (entry: OutboxEntry) => {
    if (entry.state === "failed") {
      return `failed: ${entry.lastError ?? "unknown error"} · ${attemptsLabel(entry.attempts)}`
    }
    const countdown = outbox.countdownOf(entry)
    return entry.attempts === 0 ? countdown : `${countdown} · ${attemptsLabel(entry.attempts)}`
  }

  const hint = () => {
    if (outbox.armed() === "release") {
      return "press s again to send now"
    }
    if (outbox.armed() === "delete") {
      return "press d again to delete"
    }
    if (outbox.section() === "pending") {
      return "tab drafts · ↑↓ move · c cancel · s send now · esc close"
    }
    return "tab pending · ↑↓ move · ⏎ open · d delete · esc close"
  }

  const handleGlobalKey = (event: KeyEvent): boolean => {
    if (event.ctrl && event.name === "c") {
      event.preventDefault()
      renderer.destroy()
      return true
    }
    if (event.name === "escape") {
      event.preventDefault()
      props.onClose()
      return true
    }
    if (event.name === "tab") {
      event.preventDefault()
      outbox.toggleSection()
      return true
    }
    return false
  }

  const handleMovementKey = (event: KeyEvent): boolean => {
    if (event.name === "down" || (event.name === "j" && !event.ctrl)) {
      event.preventDefault()
      outbox.moveSelection(1)
      return true
    }
    if (event.name === "up" || (event.name === "k" && !event.ctrl)) {
      event.preventDefault()
      outbox.moveSelection(-1)
      return true
    }
    return false
  }

  const handleRowKey = (event: KeyEvent): boolean => {
    const pending = outbox.section() === "pending"
    if (pending && event.name === "s" && !event.ctrl) {
      event.preventDefault()
      outbox.releaseSelected()
      return true
    }
    if (pending && event.name === "c" && !event.ctrl) {
      event.preventDefault()
      outbox.cancelSelected()
      return true
    }
    if (!pending && (event.name === "d" || event.name === "delete") && !event.ctrl) {
      event.preventDefault()
      outbox.deleteSelected()
      return true
    }
    if (!pending && event.name === "return") {
      event.preventDefault()
      outbox.openDraft()
      return true
    }
    return false
  }

  useKeyboard((event: KeyEvent) => {
    const handled = handleGlobalKey(event) || handleMovementKey(event) || handleRowKey(event)
    if (!handled) {
      outbox.disarm()
    }
  })

  return (
    <box flexGrow={1} flexDirection="column">
      <box
        flexGrow={1}
        flexDirection="column"
        border
        borderColor={theme.accent}
        title="outbox"
        titleColor={theme.accent}
        paddingLeft={2}
        paddingRight={2}
      >
        <box flexDirection="row" gap={2} flexShrink={0}>
          <text fg={outbox.section() === "pending" ? theme.accent : theme.muted}>
            {`Pending (${outbox.entries().length})`}
          </text>
          <text fg={outbox.section() === "drafts" ? theme.accent : theme.muted}>
            {`Drafts (${outbox.drafts().length})`}
          </text>
        </box>
        <scrollbox
          ref={(box) => {
            setScrollBox(box)
          }}
          flexGrow={1}
          paddingTop={1}
        >
          <Show
            when={outbox.section() === "pending"}
            fallback={
              <Show
                when={outbox.drafts().length > 0}
                fallback={<text fg={theme.muted}>no drafts · escape closes</text>}
              >
                <For each={outbox.drafts()}>
                  {(draft, index) => (
                    <OutboxRow
                      id={draftRowId(draft.id)}
                      title={`${addressList(draft.to)} · ${draft.subject.trim().length === 0 ? "(no subject)" : draft.subject}`}
                      account={accountLabelOf(draft.accountId)}
                      detail={`updated ${formatMessageDateTime(draft.updatedAt)}`}
                      selected={index() === outbox.selectedIndex()}
                    />
                  )}
                </For>
              </Show>
            }
          >
            <Show
              when={outbox.entries().length > 0}
              fallback={<text fg={theme.muted}>no pending messages · escape closes</text>}
            >
              <For each={outbox.entries()}>
                {(entry, index) => (
                  <OutboxRow
                    id={entryRowId(entry.id)}
                    title={`${addressList(entry.to)} · ${entry.subject.trim().length === 0 ? "(no subject)" : entry.subject}`}
                    account={accountLabelOf(entry.accountId)}
                    detail={entryDetail(entry)}
                    detailColor={entry.state === "failed" ? theme.error : undefined}
                    selected={index() === outbox.selectedIndex()}
                  />
                )}
              </For>
            </Show>
          </Show>
        </scrollbox>
      </box>
      <box flexDirection="row" gap={1} paddingLeft={2} paddingRight={2} flexShrink={0} height={1}>
        <Show
          when={outbox.loading()}
          fallback={
            <text
              fg={outbox.statusError() ? theme.error : theme.muted}
              flexGrow={1}
              wrapMode="none"
              truncate
            >
              {outbox.status()}
            </text>
          }
        >
          <Spinner label="loading the outbox…" />
        </Show>
        <text fg={theme.muted} flexShrink={0} wrapMode="none" truncate>
          {hint()}
        </text>
      </box>
    </box>
  )
}

export { OutboxScreen, type OutboxScreenProps }
