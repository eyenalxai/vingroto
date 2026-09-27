import type { SyncConfig } from "@vingroto/core/config/schema"
import type { Mailbox } from "@vingroto/core/protocol/mail"

import { Uid } from "@vingroto/core/ids"
import * as DateTime from "effect/DateTime"

import type { MailboxWindowRequest } from "@/lib/mail/imap-types"

const initialWindow = (
  row: Mailbox,
  config: SyncConfig,
  now: DateTime.Utc,
): MailboxWindowRequest => ({
  path: row.path,
  since: DateTime.subtract(now, { days: config.initialDays }),
  fromUid: undefined,
})

const toWindowRequest = (
  row: Mailbox,
  config: SyncConfig,
  now: DateTime.Utc,
): MailboxWindowRequest => {
  if (row.syncedAt === null) {
    return initialWindow(row, config, now)
  }
  if (row.lastSeenUid > 0) {
    return { path: row.path, fromUid: Uid.make(row.lastSeenUid + 1), since: undefined }
  }
  // Synced before without a UID watermark: rewind a day to cover day-granular date searches.
  return {
    path: row.path,
    since: DateTime.subtract(DateTime.makeUnsafe(row.syncedAt), { days: 1 }),
    fromUid: undefined,
  }
}

export { initialWindow, toWindowRequest }
