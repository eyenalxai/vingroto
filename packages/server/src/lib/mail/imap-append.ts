import type { AccountConfig } from "@vingroto/core/config/schema"
import type { ImapFlow } from "imapflow"

import { Uid } from "@vingroto/core/ids"
import * as Effect from "effect/Effect"

import { commandTimeout, guard } from "@/lib/mail/imap-command"

const appendToMailbox = Effect.fn("Imap.appendToMailbox")(function* append(
  client: ImapFlow,
  account: AccountConfig,
  mailboxPath: string,
  source: Buffer,
  flags: readonly string[],
) {
  const result = yield* guard(account, `append ${mailboxPath}`, commandTimeout, async () =>
    client.append(mailboxPath, source, [...flags]),
  )
  return result === false || result.uid === undefined ? undefined : Uid.make(result.uid)
})

export { appendToMailbox }
