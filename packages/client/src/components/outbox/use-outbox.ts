import type { Draft, OutboxEntry } from "@vingroto/core/protocol/outgoing"

import { Effect } from "effect"
import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"

import type { MailClientError } from "@/lib/api"
import type { AppRuntime } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { reportClientFailure } from "@/lib/failure"

type OutboxSection = "pending" | "drafts"
type ArmedAction = "release" | "delete"

interface OutboxOptions {
  readonly runtime: AppRuntime
  readonly dataVersion: () => number
  readonly onOpenDraft: (draft: Draft) => void
  readonly onDisconnected: (message: string) => void
}

const armDurationMs = 3000

const useOutbox = (options: OutboxOptions) => {
  const [section, setSection] = createSignal<OutboxSection>("pending")
  const [entries, setEntries] = createSignal<readonly OutboxEntry[]>([])
  const [drafts, setDrafts] = createSignal<readonly Draft[]>([])
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [loading, setLoading] = createSignal(false)
  const [status, setStatus] = createSignal("")
  const [statusError, setStatusError] = createSignal(false)
  const [armed, setArmed] = createSignal<ArmedAction | undefined>()
  const [now, setNow] = createSignal(Date.now())

  let armTimer: ReturnType<typeof setTimeout> | null = null

  const selectedEntry = createMemo(() => entries()[selectedIndex()])
  const selectedDraft = createMemo(() => drafts()[selectedIndex()])

  const rowCount = () => (section() === "pending" ? entries().length : drafts().length)

  const report = (message: string, error = false) => {
    setStatus(message)
    setStatusError(error)
  }

  const reportFailure = (label: string, error: MailClientError) => {
    reportClientFailure(label, error, {
      onDisconnected: options.onDisconnected,
      onStatus: (message) => {
        report(message, true)
      },
    })
  }

  const disarm = () => {
    if (armTimer !== null) {
      clearTimeout(armTimer)
      armTimer = null
    }
    setArmed(undefined)
  }

  const arm = (action: ArmedAction) => {
    disarm()
    setArmed(action)
    armTimer = setTimeout(() => {
      armTimer = null
      setArmed(undefined)
    }, armDurationMs)
  }

  const applyLoaded = (nextEntries: readonly OutboxEntry[], nextDrafts: readonly Draft[]) => {
    setEntries(nextEntries)
    setDrafts(nextDrafts)
    const count = section() === "pending" ? nextEntries.length : nextDrafts.length
    setSelectedIndex((current) => Math.max(0, Math.min(current, count - 1)))
  }

  const load = () => {
    setLoading(true)
    const program = Effect.gen(function* loadOutbox() {
      yield* Effect.gen(function* queryOutbox() {
        const client = yield* MailClient
        const [outbox, nextDrafts] = yield* Effect.all([client.listOutbox(), client.listDrafts()])
        yield* Effect.sync(() => {
          applyLoaded(outbox, nextDrafts)
        })
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            reportFailure("could not load the outbox", error)
          }),
        ),
      )
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          setLoading(false)
        }),
      ),
    )
    options.runtime.runFork(program)
  }

  const moveSelection = (delta: number) => {
    disarm()
    const count = rowCount()
    if (count === 0) {
      return
    }
    setSelectedIndex((current) => Math.min(Math.max(current + delta, 0), count - 1))
  }

  const toggleSection = () => {
    disarm()
    setSection((current) => (current === "pending" ? "drafts" : "pending"))
    setSelectedIndex(0)
  }

  const runGuarded = (
    label: string,
    program: Effect.Effect<void, MailClientError, MailClient>,
  ): Effect.Effect<void, never, MailClient> =>
    Effect.gen(function* runGuardedProgram() {
      yield* program.pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            reportFailure(label, error)
          }),
        ),
      )
    })

  const cancelSelected = () => {
    const entry = selectedEntry()
    if (entry === undefined) {
      report("select a pending message")
      return
    }
    disarm()
    report("cancelling…")
    const program = runGuarded(
      "could not cancel the message",
      Effect.gen(function* cancelOutboxEntry() {
        const client = yield* MailClient
        yield* client.cancelOutbox(entry.id)
        yield* Effect.sync(() => {
          report("cancelled · moved to drafts")
          load()
        })
      }),
    )
    options.runtime.runFork(program)
  }

  const releaseSelected = () => {
    const entry = selectedEntry()
    if (entry === undefined) {
      report("select a pending message")
      return
    }
    if (armed() !== "release") {
      arm("release")
      return
    }
    disarm()
    report("sending now…")
    const program = runGuarded(
      "could not release the message",
      Effect.gen(function* releaseOutboxEntry() {
        const client = yield* MailClient
        yield* client.releaseOutbox(entry.id)
        yield* Effect.sync(() => {
          report("released · sending now")
          load()
        })
      }),
    )
    options.runtime.runFork(program)
  }

  const deleteSelected = () => {
    const draft = selectedDraft()
    if (draft === undefined) {
      report("select a draft")
      return
    }
    if (armed() !== "delete") {
      arm("delete")
      return
    }
    disarm()
    report("deleting…")
    const program = runGuarded(
      "could not delete the draft",
      Effect.gen(function* deleteOutboxDraft() {
        const client = yield* MailClient
        yield* client.deleteDraft(draft.id)
        yield* Effect.sync(() => {
          report("draft deleted")
          load()
        })
      }),
    )
    options.runtime.runFork(program)
  }

  const openDraft = () => {
    const draft = selectedDraft()
    if (draft === undefined) {
      report("select a draft")
      return
    }
    options.onOpenDraft(draft)
  }

  const countdownOf = (entry: OutboxEntry) => {
    const remaining = Math.max(0, Math.ceil((entry.sendAt - now()) / 1000))
    return remaining === 0 ? "sending…" : `sends in ${remaining}s`
  }

  createEffect(() => {
    options.dataVersion()
    load()
  })

  onMount(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    onCleanup(() => {
      clearInterval(timer)
    })
  })

  onCleanup(disarm)

  return {
    armed,
    cancelSelected,
    countdownOf,
    deleteSelected,
    disarm,
    drafts,
    entries,
    load,
    loading,
    moveSelection,
    openDraft,
    releaseSelected,
    section,
    selectedDraft,
    selectedEntry,
    selectedIndex,
    status,
    statusError,
    toggleSection,
  }
}

export { useOutbox, type OutboxOptions, type OutboxSection }
