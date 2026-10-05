import { ActionFailure, SyncFailure } from "@vingroto/core/protocol/mail"

const reauthorizationRequiredText = "authorization expired · re-authorize in settings"

const formatActionFailure = (failure: ActionFailure): string =>
  ActionFailure.match(failure, {
    imap: ({ accountId, mailboxPath, operation, message }) =>
      `account ${accountId} mailbox ${mailboxPath}: ${operation} failed: ${message}`,
    keyring: ({ accountId, mailboxPath, operation, message }) =>
      `account ${accountId} mailbox ${mailboxPath}: credential ${operation} failed: ${message}`,
    "credential-missing": ({ accountId, mailboxPath, message }) =>
      `account ${accountId} mailbox ${mailboxPath}: ${message}`,
    oauth: ({ accountId, mailboxPath, message, reauthorizationRequired }) =>
      `account ${accountId} mailbox ${mailboxPath}: ${
        reauthorizationRequired ? reauthorizationRequiredText : message
      }`,
    "cache-write": ({ accountId, message }) =>
      `account ${accountId}: could not update the local cache · ${message}`,
    "account-not-configured": ({ accountId }) => `account ${accountId} is not configured`,
    "messages-not-found": ({ count }) => `${count} message(s) were not found locally`,
  })

const summarizeActionFailures = (failures: readonly ActionFailure[]): string => {
  const first = failures[0]
  return first === undefined ? "" : `${failures.length} failed · ${formatActionFailure(first)}`
}

const formatSyncFailure = (failure: SyncFailure): string =>
  SyncFailure.match(failure, {
    mailbox: ({ mailboxPath, message }) => `${mailboxPath}: ${message}`,
    oauth: ({ message, reauthorizationRequired }) =>
      reauthorizationRequired ? reauthorizationRequiredText : message,
    sync: ({ message }) => message,
  })

export { formatActionFailure, formatSyncFailure, summarizeActionFailures }
