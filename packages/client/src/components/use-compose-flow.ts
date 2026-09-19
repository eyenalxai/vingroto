import type { AccountConfig } from "@vingroto/core/config/schema"
import type { MessageId } from "@vingroto/core/ids"
import type { MessageDetail } from "@vingroto/core/protocol/mail"
import type { Draft } from "@vingroto/core/protocol/outgoing"

import { createMemo, createSignal } from "solid-js"

import type { BodyState } from "@/lib/mail/body-state"
import type { ComposerSeed } from "@/lib/mail/compose"

import { emptyComposerSeed, seedFromDraft } from "@/lib/mail/compose"
import { buildReplySeed } from "@/lib/mail/reply"

interface ComposeFlowOptions {
  readonly accounts: () => readonly AccountConfig[]
  readonly selectedMessageId: () => MessageId | undefined
  readonly detail: () => MessageDetail | undefined
  readonly bodyState: () => BodyState | undefined
  readonly onStatus: (message: string) => void
}

const useComposeFlow = (options: ComposeFlowOptions) => {
  const [composing, setComposing] = createSignal<ComposerSeed | undefined>()
  const [outboxOpen, setOutboxOpen] = createSignal(false)

  const active = createMemo(() => composing() !== undefined || outboxOpen())

  const beginCompose = () => {
    setComposing(emptyComposerSeed(options.accounts()[0]?.id))
  }

  const beginReply = (all: boolean) => {
    const selected = options.selectedMessageId()
    if (selected === undefined) {
      options.onStatus("select a message to reply to")
      return
    }
    const detail = options.detail()
    if (detail === undefined || detail.id !== selected) {
      options.onStatus("loading message…")
      return
    }
    const body = options.bodyState()
    if (body === undefined || body._tag === "loading") {
      options.onStatus("loading message…")
      return
    }
    if (body._tag === "error") {
      options.onStatus(`could not load the message · ${body.message}`)
      return
    }
    setComposing(
      buildReplySeed({
        accounts: options.accounts(),
        all,
        body: { html: body.html, text: body.text },
        detail,
      }),
    )
  }

  const openDraft = (draft: Draft) => {
    setOutboxOpen(false)
    setComposing(seedFromDraft(draft))
  }

  return {
    active,
    beginCompose,
    beginReply,
    closeComposer: () => {
      setComposing(undefined)
    },
    closeOutbox: () => {
      setOutboxOpen(false)
    },
    composing,
    openDraft,
    openOutbox: () => {
      setOutboxOpen(true)
    },
    outboxOpen,
  }
}

export { useComposeFlow, type ComposeFlowOptions }
