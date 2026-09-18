# Messages read on display stay in unread views until the next visit

The client marks a message read once its body is displayed in the reader; it never marks messages the reader has not shown. The row keeps its place in the current Unread view — global or per-account — with its unread marker cleared and the mailbox counts already updated, until that view is left and visited again. Messages keep being removed from an Unread view immediately when the user marks them read or unread explicitly, and when they are moved.

## Considered options

- **Remove the row immediately** (the usual mail-client behavior). Rejected: reloads triggered while the user is reading shift the list under the cursor and move the selection.
- **Delay the seen write until the user moves on.** Rejected: a message the user read and left on screen with the reader open would never be marked read on the server.
- **Keep read messages in the Unread views for the rest of the session.** Rejected: the view would never shrink and would stop meaning "unread".
