import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"

import * as Effect from "effect/Effect"

import { runProcess } from "@/lib/credential/process"
import { OAuthAuthorizationFailed } from "@/lib/oauth/errors"

// A failed open must still tell the user where to go.
// The authorization URL travels in the failure message rather than dying with the closed listener.
const openWithXdg = (spawner: ChildProcessSpawner["Service"]) =>
  Effect.fn("GoogleOAuth.openBrowser")(function* openInSystemBrowser(url: string) {
    const result = yield* runProcess(spawner, "xdg-open", [url]).pipe(
      Effect.catchTag("PlatformError", (error) =>
        Effect.fail(
          new OAuthAuthorizationFailed({
            message: `could not open the system browser (${error.message}); open this URL manually: ${url}`,
          }),
        ),
      ),
    )
    if (result.exitCode !== 0) {
      return yield* new OAuthAuthorizationFailed({
        message: `the system browser opener exited with code ${result.exitCode} (${result.stderr.trim()}); open this URL manually: ${url}`,
      })
    }
    return yield* Effect.void
  })

export { openWithXdg }
