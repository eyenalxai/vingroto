# The api command streams bodies and reports failures with exit codes

Status: accepted

`vingroto api` treats stdout as the response body and stderr as the failure report. The body is never printed twice, and failures do not render Effect CLI's `ERROR` banner.

- A 2xx body is written to stdout chunk by chunk as it arrives. Before, the command awaited `response.text()`, so a long-lived response such as `vingroto api event.subscribe` buffered forever and printed nothing.
- A non-2xx response writes the body to stdout exactly once and one line to stderr: `error: GET /api/messages failed with HTTP 400 Bad Request: missing required query parameter "scope" (one of: all, unread, mailbox)`. The server message is the JSON body's `message` field when it has one, so the line stays useful for errors that carry no message.
- Exit codes: `0` success, `1` usage error, `2` the daemon cannot be reached (no registration, unreadable token, connection refused, premature read failure), `3` the API answered with an error status. Scripts and agents can tell a bad invocation from a down daemon from a rejected request, so retry and repair logic never has to parse prose.
- Transport failures are a `DaemonUnreachable` error that the command catches once and renders as the `error:` line; the failure paths set `process.exitCode` and return instead of failing the effect, which keeps Effect CLI from printing its banner and overriding the code. `process.exit` is not used because it can truncate stdout that has not drained.

## Considered options

- **Keeping the `ERROR` banner and the body on stderr.** Rejected: it printed the whole body twice, buried the server's message under an unhandled-error rendering, and made stdout useless for piping.
- **Errors only on stderr.** Rejected: the error body is the API's answer; scripts parse its `_tag` and `field`, so it must reach stdout like every other response.
- **Exit 1 for every failure.** Rejected: an agent cannot distinguish a typo from a dead daemon from a rejected request, which is exactly the distinction retry logic needs.
- **`process.exit(code)` after writing.** Rejected: it can cut off buffered stdout when the body has not drained; setting the exit code and returning lets the process finish normally.
