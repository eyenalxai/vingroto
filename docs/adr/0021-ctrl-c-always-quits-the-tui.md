# Ctrl+C always quits the TUI

Status: accepted

`ctrl+c` quits the TUI from every screen — composer, settings, setup, move picker, startup and the mail workspace — and never closes the current screen. The one exception is an active text selection: `ctrl+c` then copies it to the terminal clipboard, keeping the standard gesture for selected text. Screen-scoped closes stay on `esc` and each screen's own keys, and any hint that shows a close next to the quit spells it as `ctrl+c quit app`. The quit is immediate: the composer does not wait for its pending draft autosave, so the last edit before the autosave debounce can be lost.

Quitting is the one action that must never depend on where the user is: an overlay that swallows `ctrl+c` can strand someone whose screen is stuck or whose daemon is unreachable. Keeping `esc` as the single screen-scoped close also keeps the draft flush on the deliberate key, and the explicit `quit app` wording removes the close-versus-quit ambiguity that a bare `ctrl+c quit` hint creates in a screen that shows `esc close` beside it.
