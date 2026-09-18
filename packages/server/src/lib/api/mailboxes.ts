import { describeError } from "@vingroto/core/errors"
import { InternalError, MailboxNotFoundError } from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { ServerApi } from "@/lib/api/api"
import { readMailboxSnapshot, updateMailboxMute } from "@/lib/mailboxes"
import { getMailbox } from "@/lib/store/mailboxes"

const toInternal = (error: unknown) => new InternalError({ message: describeError(error) })

const MailboxHandlers = HttpApiBuilder.group(ServerApi, "mailboxes", (handlers) =>
  handlers
    .handle("mailbox.snapshot", () => readMailboxSnapshot().pipe(Effect.mapError(toInternal)))
    .handle("mailbox.setMuted", ({ params, payload }) =>
      Effect.gen(function* setMuted() {
        const mailbox = yield* getMailbox(params.mailboxId).pipe(Effect.mapError(toInternal))
        if (mailbox === undefined) {
          return yield* new MailboxNotFoundError({
            mailboxId: params.mailboxId,
            message: `mailbox ${params.mailboxId} was not found`,
          })
        }
        return yield* updateMailboxMute(params.mailboxId, payload.muted).pipe(
          Effect.mapError(toInternal),
        )
      }),
    ),
)

export { MailboxHandlers }
