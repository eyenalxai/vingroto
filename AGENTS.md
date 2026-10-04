# vingroto

A terminal mail client: an OpenTUI (Solid) TUI talks to a long-running daemon over a local Effect HTTP API. The daemon owns the configuration file, the OS keyring, the SQLite cache and every IMAP/SMTP connection; clients are stateless and only speak the API. `README.md` documents the product, `CONTEXT.md` the domain vocabulary.

## Workspace

A Bun workspace with three packages:

- `packages/core` (`@vingroto/core`) — the protocol, the config schema, errors, branded ids and shared helpers. It is imported through its package `exports` subpaths (`@vingroto/core/protocol/api`, `@vingroto/core/errors`, …) and depends on neither other package.
- `packages/client` (`@vingroto/client`) — the OpenTUI (Solid) TUI and the `api` command. It only speaks the HTTP API; it never reads the config file, the keyring or the database.
- `packages/server` (`@vingroto/server`) — the daemon: config, keyring credentials, Drizzle on SQLite, IMAP/SMTP, sync, the outbox scheduler and the API handlers.

Inside a package, import through the `@/*` alias; `tsconfig.base.json` holds the shared compiler options.

## Commands

- `bun run check` — format check, type-aware oxlint (including the Effect rules), `tsc` and the test suites. Run it before committing.
- `bun run format`, `bun run lint`, `bun run lint:fix`, `bun run tsc`.
- `bun server`, `bun client`, `bun client api …` to run the processes.
- `bun db:generate`, `bun db:check` for migrations.
- `bun install` re-applies the oxlint patch through the root `prepare` script; if lint reports the Effect rules as unknown, run `bun run prepare`.

## Conventions

- Bun is the runtime, package manager and test runner; ESM throughout.
- No barrel files and no re-exports: import the leaf module directly.
- No lint rule suppressions; fix the code instead of disabling a rule.
- No `as any`, no casts that silence the type checker, no non-null assertions, no `@ts-ignore`.
- Comments only to explain a hard "why this way?"; code says what it does.
- Implementation files live in `src/lib/`; the client's UI components live in `src/components/`.
- Drizzle ORM only: query through the Drizzle schema, never raw SQL strings.
- Wire payloads are camelCase; database columns stay snake_case and are mapped at the store boundary. Outcome payloads carry tagged failure structs, not display strings.
- Migrations are generated with `bun db:generate` and validated with `bun db:check`; never write or edit a migration by hand, and never lose data.
- Do not add tests.

### Effect

The workspace runs Effect 4.0.0-rc.115:

- Services: `class X extends Context.Service<X, XShape>()("vingroto/lib/…")` with `static readonly layer = Layer.effect(X, Effect.gen(function* () { … }))` that returns `X.of({ … })`.
- Service methods and other reusable effects: `Effect.fn("Domain.operation")(function* …)`.
- Errors: `Schema.TaggedError`.
- Records: `Schema.Struct(…)` with a same-name declaration for its decoded type (`interface` for plain shapes, `type X = Schema.Schema.Type<typeof X>` for schemas).
- Runtime configuration goes through `Config`, not `process.env`.

The recommended Effect lint rules come from `@effect/tsgo` through `oxlint.config.ts`, so `bun run lint` reports Effect diagnostics without a language-server install. `node_modules/effect/AGENTS.md` resolves from the repository root.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `eyenalxai/vingroto`, driven with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: vocabulary in `CONTEXT.md`, decisions in `docs/adr/`. See `docs/agents/domain.md`.

# Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect apis and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.
