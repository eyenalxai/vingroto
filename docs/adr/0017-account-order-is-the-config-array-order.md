# Account order is the config array order

Status: accepted

The order of `config.accounts` is the account order everywhere: the settings sidebar, the mailbox pane, account-scoped lists and totals. The first account in the array is the compose default. `account.reorder` takes the full list of account ids and rewrites the array in that order; there is no per-account order field.

Reordering validates that the request lists exactly the configured accounts — same length, no duplicates, every id known — and fails with `InvalidRequestError` naming `body.accountIds` otherwise. An account object always moves with its id, label, servers and send setting, so a reorder can neither drop an account nor invent one.

## Considered options

- **A per-account `order` field.** Rejected: array position and field become two sources of truth that can disagree after a partial write or a hand-edited config, and every reader has to sort before showing accounts. The array is already persisted in order, so keeping the order only there removes that class of drift.
- **One endpoint per move (`up` / `down`).** Rejected: the caller would have to hold the view of the account list, and two moves racing would make the result depend on arrival order. Sending the whole order makes each request idempotent and lets the server validate the result against the config.
