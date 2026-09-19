import { MailboxNotFoundError } from "@vingroto/core/protocol/api/errors"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { ServerApi } from "@/lib/api/api"
import { internalFailure, sanitizeFailure } from "@/lib/api/internal-error"
import { readMailboxSnapshot, updateMailboxMute } from "@/lib/mailboxes"

const MailboxHandlers = HttpApiBuilder.group(ServerApi, "mailboxes", (handlers) =>
  handlers
    .handle("mailbox.snapshot", () => sanitizeFailure(readMailboxSnapshot()))
    .handle("mailbox.setMuted", ({ params, payload }) =>
      Effect.catchTags(
        updateMailboxMute(params.mailboxId, payload.muted),
        {
          MailboxNotFound: (error) =>
            Effect.fail(
              new MailboxNotFoundError({ mailboxId: error.mailboxId, message: error.message }),
            ),
        },
        internalFailure,
      ),
    ),
)

export { MailboxHandlers }
