import type { Mailbox } from "@vingroto/core/protocol/mail"

import type { TerminalFocus } from "@/components/use-terminal-focus"

const shouldAnnounceNewMail = (
  focus: TerminalFocus,
  visible: boolean,
  mailbox: Mailbox,
  enabled: boolean,
): boolean =>
  enabled && !mailbox.muted && mailbox.syncedAt !== null && (focus === "blurred" || !visible)

export { shouldAnnounceNewMail }
