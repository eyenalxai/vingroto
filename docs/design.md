# The TUI visual language

This is the design the TUI implements. It is a description, not a proposal: when the code and this document disagree, one of them is a bug.

## Panes

A pane is a bordered box with a lowercase title. The focused pane draws its border and title in `theme.accent`; every other pane draws them in `theme.border` and `theme.muted`. Titles join their parts with `·` (`compose · draft`, `outbox · 3`), and pane content keeps one column of padding on the left and right.

The workspace has three panes: **mailboxes**, the message list and the **reader**. The reader keeps its title across scopes, so the outbox and drafts previews read as the same pane with different content.

## Selection and hierarchy

A selected row paints `theme.selectionBackground` across its full width and uses `theme.selectionForeground` for every glyph on it — values, labels, badges, dates, markers and spinners. Nothing on a selected row keeps its normal color.

Outside selection:

- primary text is `theme.text`
- secondary text, labels and quiet counts are `theme.muted`
- attention counts (unread) are `theme.unread`
- failures are `theme.error`
- account names are `theme.accent`
- rules and borders are `theme.border`

Account rows are group headers: the name in `theme.accent` with a `▾`/`▸` fold marker in `theme.muted`. Mailbox rows indent two columns under their account, and a muted mailbox keeps its `⊘` marker while its name and count go quiet.

## Spacing and rules

Logical groups inside a pane are separated by exactly one blank row (`<box height={1} />`), and a pane never starts or ends with one. Horizontal rules always come from `Divider` (`components/divider.tsx`); no screen draws a rule by repeating `─` in a string.

The mailbox pane groups its virtual views the way they are used: **All emails** and **All unread** together, then a blank row, **Outbox** and **Drafts** together, then a blank row, the `Divider`, and the accounts below it. The blank rows are view-only; the mailbox tree itself has no spacer rows.

## Footers

Every full-screen view ends with the shared `StatusBar`: the first row reserves a two-column spinner slot and carries the status message, further rows carry the key hints. The message uses `theme.text`, or `theme.error` with `error` when the status is a failure; the spinner appears only while something is in flight, and hints wrap instead of truncating. Hints are lowercase, separate bindings with `·`, and spell keys as `⏎`, `esc`, `ctrl+s`, `shift+↑↓`.

Hints that pair an `esc` close with the quit say `ctrl+c quit app`, never a bare `ctrl+c quit`, so closing a screen is never confused with quitting. `ctrl+c` quits the TUI immediately from every screen and never closes the current screen (ADR-0021).

## Empty, loading and narrow states

Empty and loading states are lowercase and `theme.muted`; loading uses `Spinner` with a `…` label (`no messages`, `no message selected`, `no drafts`, `no pending messages`, `no mailbox matches`, `no mailboxes synced yet`). A leading empty pane label is the pane's placeholder, not an error.

No fixed width exceeds the terminal: centered panels clamp to `min(preferred, terminalWidth - 4)`, hints wrap, and nothing essential is truncated away.

## Motion and glyphs

No animation in the TUI; the spinner is the only moving element. The glyph set is `▾ ▸ ⊘ ✓ • ! ↑ ↓ ← → ⏎ ·`, with no emoji.

## Per screen

- **Workspace** — the mailbox pane groups the virtual views as above and hides a count at zero. The list keeps one marker column, an 18-wide sender column (minimum 8), a subject that grows from zero basis (minimum 10) and a right-aligned date. The search line wraps rather than hides its cursor. The reader puts the subject in primary text, labels its header in a 7-wide column, and separates the header from the body with `Divider`.
- **Outbox and drafts** — same row grammar as the list, with the 14-wide countdown column and the state tail; a failed row marks itself `!` and tails `failed:` in `theme.error`. The preview separates its header from the body with `Divider` and colors a failed state line as an error.
- **Composer** — one bordered pane titled `compose` or `compose · draft`, content padding 1. `←/→` still cycles the sender on the From row, invalid fields still use `theme.error`, `esc` flushes the draft and closes, `ctrl+s` queues, and `ctrl+c` quits the app. The footer message falls back to `new message` or `draft saved` when there is no fresh status.
- **Setup** — a centered panel titled `welcome to vingroto · credentials`, `add account · servers` and so on, with the step in the title, a 15-wide label column and the footer in the `StatusBar` (`busy` while saving, `error` for failures). Credential and secret handling is unchanged.
- **Move picker** — a centered panel clamped to the terminal, titled `move to · <account>`, with a search row, a `Divider`, the mailbox rows and a wrapping `StatusBar` hint inside the panel.
- **Startup** — a quiet centered screen with the `vingroto` wordmark and the endpoint; the connecting/retrying spinner, the failure in error color and the `q quit · ctrl+c quit app` hint live in the footer.
