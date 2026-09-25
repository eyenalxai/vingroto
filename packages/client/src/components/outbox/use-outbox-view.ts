import type { Draft, OutboxEntry } from "@vingroto/core/protocol/outgoing"

import { Effect, Fiber, Schedule } from "effect"
import * as DateTime from "effect/DateTime"
import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js"

import type { MailClientError } from "@/lib/api"
import type { MailViewKind } from "@/lib/mail/mailbox-tree"
import type { AppRuntime, AppRuntimeError } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"

type ArmedAction = "release" | "delete"

interface OutboxViewOptions {
  readonly runtime: AppRuntime
  readonly enabled: () => boolean
  readonly scope: () => MailViewKind | undefined
  readonly onStatus: (status: string) => void
  readonly onDisconnected: (message: string) => void
}

const armDurationMs = 3000

const attemptsLabel = (attempts: number) => `${attempts} attempt${attempts === 1 ? "" : "s"}`

const useOutboxView = (options: OutboxViewOptions) => {
  const [entries, setEntries] = createSignal<readonly OutboxEntry[]>([])
  const [drafts, setDrafts] = createSignal<readonly Draft[]>([])
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [loading, setLoading] = createSignal(false)
  const [armed, setArmed] = createSignal<ArmedAction | undefined>()
  const [now, setNow] = createSignal(DateTime.nowUnsafe().epochMilliseconds)
  let armFiber: Fiber.Fiber<void, AppRuntimeError> | null = null
  let loadToken = 0

  const selectedEntry = createMemo(() => entries()[selectedIndex()])
  const selectedDraft = createMemo(() => drafts()[selectedIndex()])

  const rowCount = () => (options.scope() === "drafts" ? drafts().length : entries().length)

  const reportFailure = (label: string, error: MailClientError) => {
    const failure = describeClientFailure(error)
    if (failure._tag === "connection") {
      options.onDisconnected(failure.message)
      return
    }
    options.onStatus(`${label} · ${failure.message}`)
  }

  const disarm = () => {
    if (armFiber !== null) {
      options.runtime.runFork(Fiber.interrupt(armFiber))
      armFiber = null
    }
    setArmed(undefined)
  }

  const arm = (action: ArmedAction) => {
    disarm()
    setArmed(action)
    armFiber = options.runtime.runFork(
      Effect.sleep(armDurationMs).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            armFiber = null
            setArmed(undefined)
          }),
        ),
      ),
    )
  }

  const applyLoaded = (nextEntries: readonly OutboxEntry[], nextDrafts: readonly Draft[]) => {
    setEntries(nextEntries)
    setDrafts(nextDrafts)
    const count = options.scope() === "drafts" ? nextDrafts.length : nextEntries.length
    setSelectedIndex((current) => Math.max(0, Math.min(current, count - 1)))
  }

  const load = () => {
    untrack(() => {
      loadToken += 1
      const token = loadToken
      setLoading(true)
      const program = Effect.gen(function* loadOutboxView() {
        const client = yield* MailClient
        const [outbox, nextDrafts] = yield* Effect.all([client.listOutbox, client.listDrafts])
        yield* Effect.sync(() => {
          if (loadToken === token) {
            applyLoaded(outbox, nextDrafts)
          }
        })
      }).pipe(
        Effect.tapError((error) =>
          Effect.sync(() => {
            reportFailure("could not load the outbox", error)
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (loadToken === token) {
              setLoading(false)
            }
          }),
        ),
        Effect.ignore,
      )
      options.runtime.runFork(program)
    })
  }

  const moveSelection = (delta: number) => {
    disarm()
    const count = rowCount()
    if (count === 0) {
      return
    }
    setSelectedIndex((current) => Math.min(Math.max(current + delta, 0), count - 1))
  }

  const runGuarded = (
    label: string,
    program: Effect.Effect<void, MailClientError, MailClient>,
  ): Effect.Effect<void, never, MailClient> =>
    program.pipe(
      Effect.tapError((error) =>
        Effect.sync(() => {
          reportFailure(label, error)
        }),
      ),
      Effect.ignore,
    )

  const cancelSelected = () => {
    const entry = selectedEntry()
    if (entry === undefined) {
      options.onStatus("select a pending message")
      return
    }
    disarm()
    options.onStatus("cancelling…")
    const program = runGuarded(
      "could not cancel the message",
      Effect.gen(function* cancelOutboxEntry() {
        const client = yield* MailClient
        yield* client.cancelOutbox(entry.id)
        yield* Effect.sync(() => {
          options.onStatus("cancelled · moved to drafts")
          load()
        })
      }),
    )
    options.runtime.runFork(program)
  }

  const releaseSelected = () => {
    const entry = selectedEntry()
    if (entry === undefined) {
      options.onStatus("select a pending message")
      return
    }
    if (armed() !== "release") {
      arm("release")
      return
    }
    disarm()
    options.onStatus("sending now…")
    const program = runGuarded(
      "could not release the message",
      Effect.gen(function* releaseOutboxEntry() {
        const client = yield* MailClient
        yield* client.releaseOutbox(entry.id)
        yield* Effect.sync(() => {
          options.onStatus("released · sending now")
          load()
        })
      }),
    )
    options.runtime.runFork(program)
  }

  const deleteSelected = () => {
    const draft = selectedDraft()
    if (draft === undefined) {
      options.onStatus("select a draft")
      return
    }
    if (armed() !== "delete") {
      arm("delete")
      return
    }
    disarm()
    options.onStatus("deleting…")
    const program = runGuarded(
      "could not delete the draft",
      Effect.gen(function* deleteOutboxDraft() {
        const client = yield* MailClient
        yield* client.deleteDraft(draft.id)
        yield* Effect.sync(() => {
          options.onStatus("draft deleted")
          load()
        })
      }),
    )
    options.runtime.runFork(program)
  }

  const openDraft = (open: (draft: Draft) => void) => {
    const draft = selectedDraft()
    if (draft === undefined) {
      options.onStatus("select a draft")
      return
    }
    disarm()
    open(draft)
  }

  const countdownOf = (entry: OutboxEntry): string => {
    if (entry.state === "failed") {
      return "not sent"
    }
    const remaining = Math.max(0, Math.ceil((entry.sendAt - now()) / 1000))
    if (remaining === 0) {
      return entry.lastError === null ? "sending…" : "retrying…"
    }
    return entry.lastError === null ? `sends in ${remaining}s` : `retry in ${remaining}s`
  }

  const stateOf = (entry: OutboxEntry): string => {
    const attempts = entry.attempts === 0 ? "" : attemptsLabel(entry.attempts)
    if (entry.lastError === null) {
      return attempts
    }
    const failure = `failed: ${entry.lastError}`
    return attempts.length === 0 ? failure : `${attempts} · ${failure}`
  }

  const detailOf = (entry: OutboxEntry): string => {
    const state = stateOf(entry)
    return state.length === 0 ? countdownOf(entry) : `${countdownOf(entry)} · ${state}`
  }

  createEffect(() => {
    if (!options.enabled()) {
      return
    }
    load()
  })

  createEffect(() => {
    if (options.scope() === undefined) {
      return
    }
    setSelectedIndex(0)
    disarm()
    setNow(DateTime.nowUnsafe().epochMilliseconds)
    const fiber = options.runtime.runFork(
      Effect.repeat(
        Effect.sync(() => {
          setNow(DateTime.nowUnsafe().epochMilliseconds)
        }),
        Schedule.spaced("1 seconds"),
      ),
    )
    onCleanup(() => {
      options.runtime.runFork(Fiber.interrupt(fiber))
    })
  })

  onCleanup(disarm)

  return {
    armed,
    cancelSelected,
    countdownOf,
    deleteSelected,
    detailOf,
    disarm,
    drafts,
    entries,
    load,
    loading,
    moveSelection,
    openDraft,
    releaseSelected,
    selectedDraft,
    selectedEntry,
    selectedIndex,
    stateOf,
  }
}

export { useOutboxView, type OutboxViewOptions }
