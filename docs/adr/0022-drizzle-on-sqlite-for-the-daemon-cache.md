# Drizzle on SQLite for the daemon's cache

The daemon persists its mail cache, drafts and outbox in SQLite through Drizzle ORM, and schema changes ship as Drizzle-generated migrations (`bun db:generate`, validated with `bun db:check`). Queries go through the Drizzle schema rather than raw SQL strings. Effect's own SQL modules (`effect/unstable/sql` with `Model.Class`) are the ecosystem default and were not chosen: the Drizzle schema is the single source of truth for both the typed queries and the generated, reviewable migrations, which is what keeps schema changes additive and data-preserving.

## Considered options

- **`effect/unstable/sql` with `Model.Class`.** The Effect-native option, but its migration story is less reviewable here and the Drizzle schema already defines every table, index and constraint that the cache and outbox rely on.
