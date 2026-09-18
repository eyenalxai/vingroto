import { Effect } from "effect"
import { createSignal } from "solid-js"

import type { AppRuntime } from "@/lib/runtime"

import { describeError } from "@/lib/errors"
import { setMailboxMuted } from "@/lib/store/mailboxes"

interface UseFolderMuteOptions {
  readonly runtime: AppRuntime
  readonly onStatus: (message: string) => void
  readonly onChanged: () => void
}

const useFolderMute = (options: UseFolderMuteOptions) => {
  const [mutingIds, setMutingIds] = createSignal<ReadonlySet<number>>(new Set())

  const setMuting = (mailboxId: number, muting: boolean) => {
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

  const toggleMute = (mailboxId: number, name: string, muted: boolean) => {
    if (mutingIds().has(mailboxId)) {
      return
    }
    setMuting(mailboxId, true)
    const program = Effect.gen(function* muteFolder() {
      yield* setMailboxMuted(mailboxId, !muted).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            options.onStatus(muted ? `${name} unmuted` : `${name} muted`)
            options.onChanged()
          }),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            options.onStatus(`could not update the mailbox · ${describeError(error)}`)
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

export { useFolderMute, type UseFolderMuteOptions }
