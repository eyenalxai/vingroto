# Keep `exactOptionalPropertyTypes` and pass explicit fallbacks

We keep `exactOptionalPropertyTypes` enabled in every package. The wire and storage layers use `Schema.optionalKey` for keys that must be absent when they do not apply, and with the flag off an explicit `undefined` typechecks and then fails at encode/decode time (optionalKey rejects explicit undefined on encode and decode). The cost lands in JSX: OpenTUI props are optional and the renderer treats `undefined` as "reset to default", but explicit `undefined` is a type error now, so the rule is to never clear a renderer prop by omitting its key — a spread key that disappears is never reset by the reconciler — and never pass explicit `undefined` through a typed boundary; pass an explicit fallback value instead (for backgrounds, the renderer's own default `"transparent"`).

## Considered options

- **Disable the flag for the client package.** Rejected: the client encodes the same payloads it sends, so it would lose the guard exactly where this bug class lives.
- **Disable it repo-wide.** Rejected: loses the `optionalKey` guarantee everywhere.
- **Keep the conditional spread and rely on omission.** Rejected: OpenTUI's spread only iterates keys present in the current object, so removed keys are never reset — this caused stale selection highlights.
