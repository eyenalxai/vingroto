import type { ScrollBoxRenderable } from "@opentui/core"

import { For, createEffect, createSignal } from "solid-js"

import type { AccountConfig } from "@/lib/config/schema"
import type { MailboxRow } from "@/lib/store/mailboxes"
import type { MailboxCounts } from "@/lib/store/messages"

import { truncate } from "@/lib/format"
import { theme } from "@/lib/theme"

interface MailboxListProps {
  readonly accounts: readonly AccountConfig[]
  readonly mailboxes: readonly MailboxRow[]
  readonly counts: ReadonlyMap<number, MailboxCounts>
  readonly selectedId: number | undefined
  readonly focused: boolean
}

const MailboxList = (props: MailboxListProps) => {
  const [scrollBox, setScrollBox] = createSignal<ScrollBoxRenderable>()

  const mailboxesFor = (accountId: string) =>
    props.mailboxes.filter((row) => row.account_id === accountId)

  createEffect(() => {
    const box = scrollBox()
    const selected = props.selectedId
    if (box !== undefined && selected !== undefined) {
      box.scrollChildIntoView(`mailbox-row-${selected}`)
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
        <For each={props.accounts}>
          {(account) => (
            <box flexDirection="column">
              <text fg={theme.accent}>{truncate(account.label, 24)}</text>
              <For each={mailboxesFor(account.id)}>
                {(mailbox) => {
                  const isSelected = () => mailbox.id === props.selectedId
                  const unread = () => props.counts.get(mailbox.id)?.unread ?? 0
                  return (
                    <box
                      id={`mailbox-row-${mailbox.id}`}
                      flexDirection="row"
                      gap={1}
                      backgroundColor={isSelected() ? theme.selectionBackground : undefined}
                    >
                      <box flexGrow={1}>
                        <text fg={isSelected() ? theme.selectionForeground : theme.text}>
                          {truncate(mailbox.name, 20)}
                        </text>
                      </box>
                      <text fg={isSelected() ? theme.selectionForeground : theme.unread}>
                        {unread() > 0 ? String(unread()) : ""}
                      </text>
                    </box>
                  )
                }}
              </For>
            </box>
          )}
        </For>
      </scrollbox>
    </box>
  )
}

export { MailboxList }
