import { describeError } from "@vingroto/core/errors"
import * as dbus from "dbus-next"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"

const notificationsName = "org.freedesktop.Notifications"
const notificationsPath = "/org/freedesktop/Notifications"
const notificationsInterface = "org.freedesktop.Notifications"
const appName = "vingroto"

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

class DesktopNotifications extends Context.Service<DesktopNotifications, DesktopShape>()(
  "vingroto/lib/notify/DesktopNotifications",
) {
  static readonly layer = Layer.effect(
    DesktopNotifications,
    Effect.gen(function* makeDesktopNotifications() {
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
      const connect = Effect.tryPromise({
        try: async () => {
          const bus = dbus.sessionBus()
          bus.on("error", () => {
            // An unreachable session bus must not crash the daemon through an unhandled emitter error; the calls below fail and the layer stays silent.
          })
          const object = await bus.getProxyObject(notificationsName, notificationsPath)
          const proxy = object.getInterface<NotificationsInterface>(notificationsInterface)
          return { bus, proxy }
        },
        catch: (cause) => cause,
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
              appName,
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
