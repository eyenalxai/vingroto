# RPC errors cross the wire as messages

Status: superseded by [ADR-0006](0006-the-http-api-is-the-only-wire-surface.md).

All RPC handlers map domain errors to a single `ServerError { message }`. Domain services keep precise typed errors; the client branches only on connectivity (`RpcClientError` reason tags) and renders every domain failure as text. A domain error graduates to a typed wire error only when a client behavior must branch on its kind — the candidates today are a missing keyring on account save, out-of-range sync settings, an account that disappeared while being edited, and a retryable body fetch.

## Considered options

- **Typed error union on every RPC.** Rejected while the UI renders all domain failures as text: it would put every domain error payload into the frozen core protocol for a branch nobody takes. Remains available as an additive change per RPC, which is exactly what the graduation rule above requires.
