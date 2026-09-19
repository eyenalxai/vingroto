import type { ScrollBoxRenderable } from "@opentui/core"
import type { AccountId } from "@vingroto/core/ids"
import type { Draft, OutboxEntry } from "@vingroto/core/protocol/outgoing"

import { For, Show, createEffect, createMemo, createSignal } from "solid-js"

import type { MailViewKind } from "@/lib/mail/mailbox-tree"

import { Divider } from "@/components/divider"
import { Spinner } from "@/components/spinner"
import { useTheme } from "@/components/theme-provider"
import { addressList, formatMessageDateTime } from "@/lib/format"

interface HeaderLine {
  readonly label: string
  readonly value: string
  readonly error?: boolean
}

interface OutboxPreviewProps {
  readonly scope: MailViewKind
  readonly entry: OutboxEntry | undefined
  readonly draft: Draft | undefined
  readonly loading: boolean
  readonly focused: boolean
  readonly accountLabels: ReadonlyMap<AccountId, string>
  readonly detailOf: (entry: OutboxEntry) => string
  readonly onScrollRef: (box: ScrollBoxRenderable) => void
}

const OutboxPreview = (props: OutboxPreviewProps) => {
  const theme = useTheme()
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()

  const entry = createMemo(() => (props.scope === "outbox" ? props.entry : undefined))
  const draft = createMemo(() => (props.scope === "drafts" ? props.draft : undefined))
  const selected = createMemo(() => entry() ?? draft())
  const body = () => entry()?.body ?? draft()?.body ?? ""
  const subject = () => {
    const value = entry()?.subject ?? draft()?.subject ?? ""
    return value.trim().length === 0 ? "(no subject)" : value
  }

  const headerLines = createMemo<readonly HeaderLine[]>(() => {
    const current = entry()
    if (current !== undefined) {
      const lines: HeaderLine[] = [
        {
          label: "Account",
          value: props.accountLabels.get(current.accountId) ?? current.accountId,
        },
        { label: "To", value: addressList(current.to) },
      ]
      if (current.cc.length > 0) {
        lines.push({ label: "Cc", value: addressList(current.cc) })
      }
      if (current.bcc.length > 0) {
        lines.push({ label: "Bcc", value: addressList(current.bcc) })
      }
      lines.push(
        { label: "Created", value: formatMessageDateTime(current.createdAt) },
        { label: "State", value: props.detailOf(current), error: current.state === "failed" },
      )
      return lines
    }
    const currentDraft = draft()
    if (currentDraft === undefined) {
      return []
    }
    const lines: HeaderLine[] = [
      {
        label: "Account",
        value: props.accountLabels.get(currentDraft.accountId) ?? currentDraft.accountId,
      },
      { label: "To", value: addressList(currentDraft.to) },
    ]
    if (currentDraft.cc.length > 0) {
      lines.push({ label: "Cc", value: addressList(currentDraft.cc) })
    }
    if (currentDraft.bcc.length > 0) {
      lines.push({ label: "Bcc", value: addressList(currentDraft.bcc) })
    }
    lines.push({ label: "Updated", value: formatMessageDateTime(currentDraft.updatedAt) })
    return lines
  })

  createEffect(() => {
    const item = selected()
    const box = scrollBox()
    if (item !== undefined && box !== undefined) {
      box.scrollTop = 0
    }
  })

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      border
      borderColor={props.focused ? theme.accent : theme.border}
      title="reader"
      titleColor={props.focused ? theme.accent : theme.muted}
    >
      <Show
        when={selected()}
        fallback={
          <Show
            when={props.loading}
            fallback={
              <box paddingLeft={1} paddingRight={1}>
                <text fg={theme.muted}>
                  {props.scope === "drafts" ? "no draft selected" : "no pending message selected"}
                </text>
              </box>
            }
          >
            <box paddingLeft={1} paddingRight={1}>
              <Spinner
                label={props.scope === "drafts" ? "loading drafts…" : "loading the outbox…"}
              />
            </box>
          </Show>
        }
      >
        <box flexGrow={1} flexDirection="column">
          <box flexShrink={0} flexDirection="column" paddingLeft={1} paddingRight={1}>
            <text fg={theme.text} wrapMode="word">
              {subject()}
            </text>
            <For each={headerLines()}>
              {(line) => (
                <box flexDirection="row" gap={1}>
                  <box width={7}>
                    <text fg={theme.muted}>{line.label}</text>
                  </box>
                  <box flexGrow={1}>
                    <text fg={line.error === true ? theme.error : theme.text} wrapMode="word">
                      {line.value}
                    </text>
                  </box>
                </box>
              )}
            </For>
          </box>
          <Divider />
          <scrollbox
            ref={(box) => {
              setScrollBox(box)
              props.onScrollRef(box)
            }}
            flexGrow={1}
            paddingLeft={1}
            paddingRight={1}
          >
            <Show when={body().length > 0} fallback={<text fg={theme.muted}>(no body)</text>}>
              <text fg={theme.text} wrapMode="word">
                {body()}
              </text>
            </Show>
          </scrollbox>
        </box>
      </Show>
    </box>
  )
}

export { OutboxPreview, type OutboxPreviewProps }
