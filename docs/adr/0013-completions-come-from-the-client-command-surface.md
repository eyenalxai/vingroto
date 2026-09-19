# Completions come from the client's own command surface

Status: accepted

`vingroto completions <bash|zsh|nushell>` prints a completion script for the client, its subcommands, their flags and the OpenAPI operation ids of the `api` command. The same generator runs during `bun run build` and writes the scripts into `packages/client/completions/`.

- The `completions` subcommand replaces Effect CLI's built-in `--completions` global flag, which this CLI removes from its built-ins. One entry point covers all supported shells, including one Effect does not generate for.
- Bash and zsh scripts come from Effect's public `Completions.generate` with a descriptor the client builds itself. The `api` command's request argument is declared as a choice of operation ids and HTTP methods, so a tab press after `vingroto api` offers `message.list` and `get` alike.
- Operation ids are read from `@vingroto/core` at generation time (`OpenApi.fromApi(Api)`); the daemon does not have to run, and the choices cannot drift from the routes the client was built with.
- Nushell has no generator in Effect, so the client emits `extern` definitions itself: one for `vingroto`, one per subcommand, plus a `nu-complete` function per choice argument. Completing `vingroto api message.<TAB>`, `vingroto api --<TAB>` and `vingroto completions <TAB>` all work from the same generated file.
- Effect CLI does not expose flag or argument metadata to consumers (the readers are tagged internal and stripped from its published types), so the descriptor mirrors the flags declared in `api.ts` and `spec.ts`, and shares their description strings so help output and completion text stay in step.
- The scripts are static. They never call back into the binary or the daemon, so completion keeps working while the daemon is down and always matches the installed version.
- `bun run build` writes `packages/client/completions/{vingroto.bash,_vingroto,vingroto.nu}`; the directory is not committed. Distribution packages install the files as `/usr/share/bash-completion/completions/vingroto`, `/usr/share/zsh/site-functions/_vingroto` and `/usr/share/nushell/vendor/autoload/vingroto.nu`.

## Considered options

- **Keeping Effect CLI's built-in `--completions` flag.** Rejected: it knows bash, zsh and fish, not nushell, and it completes the request argument as a plain string instead of operation ids.
- **Fetching the OpenAPI document from the running daemon when generating completions.** Rejected: generation must work offline, and a completion script that queries the daemon at tab-press time would add latency and fail whenever the daemon is not running.
- **Committing the generated scripts.** Rejected: they would drift from the command definitions and add review noise; the build regenerates them and the binary can print them at any time.
- **Reading flag and argument metadata out of the command tree at runtime.** Rejected: Effect CLI keeps those readers internal and removes them from its published types, so the only type-safe alternative would have been unchecked casts.
- **Fish.** Not offered: the supported shells are bash, zsh and nushell, and Effect already generates fish, so adding it would be one entry in the shell list.
