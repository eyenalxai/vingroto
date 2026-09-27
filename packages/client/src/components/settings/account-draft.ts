import type { AccountConfig } from "@vingroto/core/config/schema"

import type { AccountDraft } from "@/components/setup/form-model"

import { emptyDraft } from "@/components/setup/form-model"

const draftFromAccount = (account: AccountConfig, username: string | undefined): AccountDraft => ({
  ...emptyDraft(),
  email: account.email,
  label: account.label,
  name: account.name ?? "",
  username: username ?? account.email,
  imapHost: account.imap.host,
  imapPort: String(account.imap.port),
  imapSecurity: account.imap.security,
  smtpHost: account.smtp.host,
  smtpPort: String(account.smtp.port),
  smtpSecurity: account.smtp.security,
  saveSent: account.saveSent,
})

const draftsMatch = (left: AccountDraft, right: AccountDraft): boolean =>
  left.email === right.email &&
  left.password === right.password &&
  left.label === right.label &&
  left.name === right.name &&
  left.username === right.username &&
  left.imapHost === right.imapHost &&
  left.imapPort === right.imapPort &&
  left.imapSecurity === right.imapSecurity &&
  left.smtpHost === right.smtpHost &&
  left.smtpPort === right.smtpPort &&
  left.smtpSecurity === right.smtpSecurity &&
  left.saveSent === right.saveSent

export { draftFromAccount, draftsMatch }
