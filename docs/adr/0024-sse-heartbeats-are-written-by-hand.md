# SSE heartbeats are written by hand

Status: accepted

The daemon's event stream keeps itself alive with a literal frame: a `Stream.tick("15 seconds")` is merged beside the stream of encoded events and emits `": heartbeat\n\n"`, with `haltStrategy: "left"` so the response ends when the event stream ends (the bus shutting down) and not when the endless ticker does. Real events go through `Sse.encoder.write`, but the heartbeat cannot: in effect@4.0.0-rc.115 the encoder renders exactly two shapes, an `Event` (`id`, `event` and `data` lines) and a `Retry` (`retry: <milliseconds>`), and has no comment model. Comments are only a decoding-side concern in Effect's `Sse`: a line beginning with `:` parses to an empty field name that the parser ignores.

That silence is what makes `": heartbeat"` the right keep-alive: no client sees an event, so the frame stays out of the typed `ServerEvent` stream, while the connection keeps carrying bytes. The response's `cache-control: no-cache, no-transform` and `x-accel-buffering: no` headers stop intermediaries from buffering or rewriting the body, but no header puts bytes on an idle connection.

## Considered options

- **An empty event through `Sse.encoder.write`.** Rejected: `Event` always writes a `data:` line and terminates the frame with a blank line, so a parser dispatches the heartbeat as a message; only a comment is silently skipped.
- **A `retry:` directive as the keep-alive.** Rejected: `Retry` is the encoder's only non-event shape, and it means "reconnect after this delay" — the client sleeps for the duration and resubscribes — so this heartbeat would tear down and rebuild the subscription every 15 seconds.
- **A `heartbeat` variant in `ServerEvent`.** Rejected: it puts transport plumbing into the shared protocol for every client to decode and ignore, when the comment frame is invisible by construction.
- **No heartbeat, leaving clients to reconnect.** Rejected: a proxy or tunnel that reaps idle connections would close the stream between events, and a reconnect is not a live subscription.
