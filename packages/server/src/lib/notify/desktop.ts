import { AppPaths } from "@vingroto/core/app-paths"
import { describeError } from "@vingroto/core/errors"
import * as dbus from "dbus-next"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"

const notificationsName = "org.freedesktop.Notifications"
const notificationsPath = "/org/freedesktop/Notifications"
const notificationsInterface = "org.freedesktop.Notifications"

interface DesktopNotification {
  readonly title: string
  readonly message: string
}

interface NotificationsInterface extends dbus.ClientInterface {
  readonly Notify: (
    appName: string,
    replacesId: number,
    appIcon: string,
    summary: string,
    body: string,
    actions: readonly string[],
    hints: Readonly<Record<string, unknown>>,
    expireTimeout: number,
  ) => Promise<number>
}

interface DesktopShape {
  readonly notify: (notification: DesktopNotification) => Effect.Effect<void>
}

interface NotificationConnection {
  readonly bus: dbus.MessageBus
  readonly proxy: NotificationsInterface
}

// Why: dbus-next would otherwise fall back to X11 window-selection discovery, while a wayland session always exposes the bus in the environment or at $XDG_RUNTIME_DIR/bus.
const sessionBusAddress = Effect.gen(function* resolveSessionBusAddress() {
  const configured = yield* Config.String("DBUS_SESSION_BUS_ADDRESS").pipe(Config.option)
  if (Option.isSome(configured) && configured.value !== "") {
    return configured.value
  }
  const runtimeDir = yield* Config.String("XDG_RUNTIME_DIR").pipe(Config.option)
  if (Option.isSome(runtimeDir) && runtimeDir.value !== "") {
    return `unix:path=${runtimeDir.value}/bus`
  }
  return null
})

class DesktopNotifications extends Context.Service<DesktopNotifications, DesktopShape>()(
  "vingroto/lib/notify/DesktopNotifications",
) {
  static readonly layer = Layer.effect(
    DesktopNotifications,
    Effect.gen(function* makeDesktopNotifications() {
      const paths = yield* AppPaths
      const connection = yield* Ref.make<NotificationConnection | null>(null)
      yield* Effect.addFinalizer(() =>
        Effect.gen(function* closeNotificationBus() {
          const current = yield* Ref.get(connection)
          if (current !== null) {
            yield* Effect.sync(() => {
              current.bus.disconnect()
            })
          }
        }),
      )
      const connect = Effect.gen(function* connectToNotifications() {
        const busAddress = yield* sessionBusAddress
        if (busAddress === null) {
          return yield* Effect.fail(new Error("no wayland session bus address"))
        }
        const bus = dbus.sessionBus({ busAddress })
        bus.on("error", () => {
          // An unreachable session bus must not crash the daemon through an unhandled emitter error; the calls below fail and the layer stays silent.
        })
        const object = yield* Effect.tryPromise({
          try: async () => {
            const proxyObject = await bus.getProxyObject(notificationsName, notificationsPath)
            return proxyObject
          },
          catch: (cause) => cause,
        })
        const proxy = object.getInterface<NotificationsInterface>(notificationsInterface)
        return { bus, proxy }
      })
      const notify = Effect.fn("DesktopNotifications.notify")(function* sendNotification(
        notification: DesktopNotification,
      ) {
        const current = yield* Ref.get(connection)
        let connected: NotificationConnection | null = current
        if (connected === null) {
          const attempt = yield* Effect.option(connect)
          if (Option.isNone(attempt)) {
            yield* Effect.logDebug("no desktop notification service on the session bus")
            return
          }
          connected = attempt.value
          yield* Ref.set(connection, connected)
        }
        yield* Effect.tryPromise({
          try: async () => {
            await connected.proxy.Notify(
              paths.appName,
              0,
              "",
              notification.title,
              notification.message,
              [],
              {},
              -1,
            )
          },
          catch: (cause) => cause,
        }).pipe(
          Effect.catch((error) =>
            Effect.logDebug("could not send a desktop notification").pipe(
              Effect.annotateLogs({ reason: describeError(error) }),
            ),
          ),
        )
      })
      return DesktopNotifications.of({ notify })
    }),
  )
}

export { DesktopNotifications, type DesktopShape }
