import type { MailboxId } from "@vingroto/core/ids"

import { Effect } from "effect"
import { createSignal } from "solid-js"

import type { AppRuntime } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"

interface UseMailboxMuteOptions {
  readonly runtime: AppRuntime
  readonly onStatus: (message: string) => void
  readonly onChanged: () => void
  readonly onDisconnected: (message: string) => void
}

const useMailboxMute = (options: UseMailboxMuteOptions) => {
  const [mutingIds, setMutingIds] = createSignal<ReadonlySet<MailboxId>>(new Set())

  const setMuting = (mailboxId: MailboxId, muting: boolean) => {
    setMutingIds((current) => {
      const next = new Set(current)
      if (muting) {
        next.add(mailboxId)
      } else {
        next.delete(mailboxId)
      }
      return next
    })
  }

  const toggleMute = (mailboxId: MailboxId, name: string, muted: boolean) => {
    if (mutingIds().has(mailboxId)) {
      return
    }
    setMuting(mailboxId, true)
    const program = Effect.gen(function* muteMailbox() {
      const client = yield* MailClient
      yield* client.setMailboxMuted(mailboxId, !muted).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            options.onStatus(muted ? `${name} unmuted` : `${name} muted`)
            options.onChanged()
          }),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            const failure = describeClientFailure(error)
            if (failure._tag === "connection") {
              options.onDisconnected(failure.message)
              return
            }
            options.onStatus(`could not update the mailbox · ${failure.message}`)
          }),
        ),
      )
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          setMuting(mailboxId, false)
        }),
      ),
    )
    options.runtime.runFork(program)
  }

  return { mutingIds, toggleMute }
}

export { useMailboxMute, type UseMailboxMuteOptions }
