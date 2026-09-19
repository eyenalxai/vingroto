import type { AccountConfig } from "@vingroto/core/config/schema"
import type { AccountId } from "@vingroto/core/ids"

import { Effect } from "effect"
import { createEffect, createMemo, createSignal } from "solid-js"

import type { AppRuntime } from "@/lib/runtime"

import { MailClient } from "@/lib/api"
import { describeClientFailure } from "@/lib/failure"

interface UseAccountOrderOptions {
  readonly runtime: AppRuntime
  readonly accounts: () => readonly AccountConfig[]
  readonly onStatus: (message: string) => void
  readonly onDisconnected: (message: string) => void
}

const useAccountOrder = (options: UseAccountOrderOptions) => {
  const [pendingOrder, setPendingOrder] = createSignal<readonly AccountId[] | undefined>()

  const accounts = createMemo(() => {
    const order = pendingOrder()
    const current = options.accounts()
    if (order === undefined) {
      return current
    }
    const byId = new Map(current.map((account) => [account.id, account]))
    const ordered: AccountConfig[] = []
    for (const id of order) {
      const account = byId.get(id)
      if (account !== undefined) {
        ordered.push(account)
        byId.delete(id)
      }
    }
    for (const account of current) {
      if (byId.has(account.id)) {
        ordered.push(account)
      }
    }
    return ordered
  })

  createEffect(() => {
    const order = pendingOrder()
    if (order === undefined) {
      return
    }
    const current = options.accounts().map((account) => account.id)
    if (current.length === order.length && current.every((id, index) => id === order[index])) {
      setPendingOrder(undefined)
    }
  })

  const move = (id: AccountId, delta: number) => {
    const current = accounts().map((account) => account.id)
    const index = current.indexOf(id)
    const target = index + delta
    if (index === -1 || target < 0 || target >= current.length) {
      return
    }
    const next = [...current]
    next.splice(index, 1)
    next.splice(target, 0, id)
    setPendingOrder(next)
    const program = Effect.gen(function* reorderAccounts() {
      const client = yield* MailClient
      yield* client.reorderAccounts(next).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            setPendingOrder(undefined)
            const failure = describeClientFailure(error)
            if (failure._tag === "connection") {
              options.onDisconnected(failure.message)
              return
            }
            options.onStatus(`could not reorder accounts · ${failure.message}`)
          }),
        ),
      )
    })
    options.runtime.runFork(program)
  }

  return { accounts, move }
}

export { useAccountOrder, type UseAccountOrderOptions }
