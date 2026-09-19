# Development runs use their own profile

Status: accepted

An installed package and a development checkout on the same machine must not share the state that belongs to one account: the database, the config file, the logs, the runtime registration and the keyring credentials.

- A process runs in the `installed` profile when it is a standalone executable and in the `development` profile when it runs from source. `VINGROTO_PROFILE=installed|development` overrides the detected profile, and an unrecognized value fails startup instead of falling back.
- The profile fixes the application name: `vingroto` for the installed package and `vingroto-dev` for a checkout. The data, config, log and runtime directories derive from it, and the name is also the keyring service and the application name shown in desktop notifications.
- The profiles hold independent state and independent credentials. The application never migrates or copies state between them, neither can read or overwrite the other's database, config or keyring entries, and a user who switches between an installed package and a checkout enters credentials once per profile.

## Considered options

- **Sharing the paths.** Rejected: a development run would migrate, sync and rewrite the state of the installed package, and a broken build could corrupt the database that caches the user's mail.
- **One state directory with a `dev` subdirectory.** Rejected: credentials are addressed by keyring attributes rather than by path, so a nested layout cannot keep them apart, and the profile identity has to reach the keyring and the notification name anyway.
- **A build-time marker (a compiled-in flag).** Rejected: `bun run` from the checkout is already the development run, while a runtime override can point any run at the other profile when reproducing packaged behavior.
