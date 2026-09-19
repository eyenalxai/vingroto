# Refreshing never moves the interface

Status: accepted

The TUI keeps its last good rows while any refetch runs, so a refresh never clears content, inserts a loading row into a list, or changes a row's geometry; activity is shown only in fixed-width slots (the status bar's leading two cells and the mailbox tree's marker and count columns). Busy in the status bar covers work the user started or is waiting on — sync, detail and body loads, mark, move, mute, per-mailbox sync and the first mailbox load — while background refetches stay silent. After the first successful status load the workspace stays mounted through connection loss with its panes, selection and scroll intact, and the status bar reports the failure; the startup screen is only for the phase before the first success, and pane focus lives above the workspace so settings, setup, the move picker and reconnects cannot reset it. When the selected item disappears from a refreshed list the selection falls back to the nearest index, never to a fixed row.

## Considered options

- **A loading row at the top of a list.** Rejected: it shifts every row down and back on every refetch, and refetches happen on each `data-changed` and sync event, so the list visibly jumps during normal use.
- **Clearing a list while refreshing it.** Rejected: it throws away scroll position and selection for data the user is already reading; stale rows are strictly better than an empty pane.
- **Unmounting the workspace on a transport failure.** Rejected: remounting resets pane focus, so keys move to a different pane after a hiccup, and the mail view disappears for a problem that often heals in one retry.
- **A fixed row geometry with per-operation spinners beside the values.** Rejected: swapping a count for a spinner changes the column width; only permanent slots keep rows still.
