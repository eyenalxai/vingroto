import type { KeyEvent } from "@opentui/core"

import { useKeyboard, useRenderer } from "@opentui/solid"
import { Effect, Fiber, Stream } from "effect"
import {
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  untrack,
} from "solid-js"

import type { AppConfig } from "@/lib/config/schema"
import type { SyncEvent } from "@/lib/mail/sync"
import type { MailboxRow } from "@/lib/store/mailboxes"
import type { MailboxCounts, MessageRow } from "@/lib/store/messages"

import { MailboxList } from "@/components/mailbox-list"
import { MessageList } from "@/components/message-list"
import { useRuntime } from "@/components/runtime-provider"
import { StartupScreen } from "@/components/startup-screen"
import { StatusBar } from "@/components/status-bar"
import { useMailSyncing } from "@/components/use-mail-syncing"
import { boot } from "@/lib/boot"
import { describeError } from "@/lib/errors"
import { SyncEngine, describeSyncEvent } from "@/lib/mail/sync"
import { listMailboxes } from "@/lib/store/mailboxes"
import { listMessages, messageCounts } from "@/lib/store/messages"

const messageWindow = 500
const keyHint = "q quit · r sync · tab pane · ↑↓ move"

type Pane = "mailboxes" | "messages"

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const App = () => {
  const runtime = useRuntime()
  const renderer = useRenderer()
  const [report] = createResource(async () => runtime.runPromise(boot))
  const [mailboxes, setMailboxes] = createSignal<readonly MailboxRow[]>([])
  const [counts, setCounts] = createSignal<ReadonlyMap<number, MailboxCounts>>(new Map())
  const [messages, setMessages] = createSignal<readonly MessageRow[]>([])
  const [selectedMailboxId, setSelectedMailboxId] = createSignal<number | undefined>()
  const [selectedMessageId, setSelectedMessageId] = createSignal<number | undefined>()
  const [pane, setPane] = createSignal<Pane>("mailboxes")
  const [status, setStatus] = createSignal("loading")

  const appConfig = createMemo((): AppConfig | undefined => {
    const value = report()
    if (value === undefined || value.config._tag !== "ok") {
      return undefined
    }
    return value.config.config
  })

  const visibleMailboxes = createMemo(() => mailboxes().filter((row) => row.selectable))
  const selectedMailbox = createMemo(() =>
    visibleMailboxes().find((row) => row.id === selectedMailboxId()),
  )

  const selectInitialMailbox = () => {
    untrack(() => {
      const rows = visibleMailboxes()
      if (rows.length === 0) {
        return
      }
      const current = selectedMailboxId()
      if (current !== undefined && rows.some((row) => row.id === current)) {
        return
      }
      const inbox = rows.find((row) => row.path.toLowerCase() === "inbox")
      setSelectedMailboxId(inbox?.id ?? rows[0]?.id)
    })
  }

  const loadMailboxes = () => {
    untrack(() => {
      const program = Effect.gen(function* loadMailboxRows() {
        yield* Effect.gen(function* queryMailboxRows() {
          const rows = yield* listMailboxes()
          const counters = yield* messageCounts()
          yield* Effect.sync(() => {
            setMailboxes(rows)
            setCounts(counters)
            selectInitialMailbox()
          })
        }).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              setStatus(`database error · ${describeError(error)}`)
            }),
          ),
        )
      })
      runtime.runFork(program)
    })
  }

  const loadMessages = (mailboxId: number) => {
    untrack(() => {
      const program = Effect.gen(function* loadMessageRows() {
        yield* Effect.gen(function* queryMessageRows() {
          const rows = yield* listMessages(mailboxId, messageWindow)
          yield* Effect.sync(() => {
            setMessages(rows)
            const current = selectedMessageId()
            if (current === undefined || !rows.some((row) => row.id === current)) {
              setSelectedMessageId(rows[0]?.id)
            }
          })
        }).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              setStatus(`database error · ${describeError(error)}`)
            }),
          ),
        )
      })
      runtime.runFork(program)
    })
  }

  const applySyncEvent = (event: SyncEvent) => {
    untrack(() => {
      setStatus(describeSyncEvent(event))
      loadMailboxes()
      const mailbox = selectedMailbox()
      if (
        mailbox !== undefined &&
        event._tag === "mailbox-done" &&
        event.accountId === mailbox.account_id &&
        event.path === mailbox.path
      ) {
        loadMessages(mailbox.id)
      }
    })
  }

  const { startPeriodic, syncWindow, syncing } = useMailSyncing({
    config: appConfig,
    onStatus: (value: string) => {
      setStatus(value)
    },
    onSynced: loadMailboxes,
    runtime,
  })

  const moveSelection = (delta: number) => {
    const rows = pane() === "mailboxes" ? visibleMailboxes() : messages()
    const currentId = pane() === "mailboxes" ? selectedMailboxId() : selectedMessageId()
    const currentIndex = rows.findIndex((row) => row.id === currentId)
    const index = clamp(
      currentIndex === -1 ? 0 : currentIndex + delta,
      0,
      Math.max(rows.length - 1, 0),
    )
    const next = rows[index]
    if (next === undefined) {
      return
    }
    if (pane() === "mailboxes") {
      setSelectedMailboxId(next.id)
    } else {
      setSelectedMessageId(next.id)
    }
  }

  createEffect(() => {
    const config = appConfig()
    if (config === undefined) {
      return
    }
    loadMailboxes()
    startPeriodic(() => config.sync.intervalMinutes)
  })

  createEffect(() => {
    const program = SyncEngine.pipe(
      Effect.flatMap((sync) =>
        sync.events.pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              applySyncEvent(event)
            }),
          ),
        ),
      ),
    )
    const fiber = runtime.runFork(program)
    onCleanup(() => {
      runtime.runFork(Fiber.interrupt(fiber))
    })
  })

  createEffect(() => {
    const mailboxId = selectedMailboxId()
    if (mailboxId === undefined) {
      setMessages([])
      setSelectedMessageId()
      return
    }
    loadMessages(mailboxId)
  })

  useKeyboard((key: KeyEvent) => {
    if ((key.ctrl && key.name === "c") || (key.name === "q" && !key.ctrl)) {
      renderer.destroy()
      return
    }
    if (key.name === "tab") {
      setPane(pane() === "mailboxes" ? "messages" : "mailboxes")
      return
    }
    if (key.name === "down" || (key.name === "j" && !key.ctrl)) {
      moveSelection(1)
      return
    }
    if (key.name === "up" || (key.name === "k" && !key.ctrl)) {
      moveSelection(-1)
      return
    }
    if (key.name === "r" && !key.ctrl) {
      const mailbox = selectedMailbox()
      syncWindow(mailbox === undefined ? undefined : [mailbox.path])
      return
    }
    if (key.name === "escape" && pane() === "messages") {
      setPane("mailboxes")
    }
  })

  return (
    <box width="100%" height="100%" flexDirection="column">
      <Show when={appConfig()} fallback={<StartupScreen report={report()} />}>
        {(config) => (
          <box flexGrow={1} flexDirection="column">
            <box flexGrow={1} flexDirection="row" gap={1}>
              <box width={28} flexDirection="column">
                <MailboxList
                  accounts={config().accounts}
                  mailboxes={visibleMailboxes()}
                  counts={counts()}
                  selectedId={selectedMailboxId()}
                  focused={pane() === "mailboxes"}
                />
              </box>
              <box flexGrow={1} flexDirection="column">
                <MessageList
                  mailbox={selectedMailbox()}
                  messages={messages()}
                  selectedId={selectedMessageId()}
                  focused={pane() === "messages"}
                />
              </box>
            </box>
            <StatusBar message={status()} syncing={syncing()} hint={keyHint} />
          </box>
        )}
      </Show>
    </box>
  )
}

export { App }
