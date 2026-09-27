import { AppPaths } from "@vingroto/core/app-paths"
import { describeError } from "@vingroto/core/errors"
import * as dbus from "dbus-next"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import * as Semaphore from "effect/Semaphore"

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

class DesktopNotificationError extends Schema.TaggedError<DesktopNotificationError>()(
  "DesktopNotificationError",
  {
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

const disconnect = (bus: dbus.MessageBus) =>
  Effect.sync(() => {
    bus.disconnect()
  })

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
  "@vingroto/server/lib/notify/desktop/DesktopNotifications",
) {
  static readonly layer = Layer.effect(
    DesktopNotifications,
    Effect.gen(function* makeDesktopNotifications() {
      const paths = yield* AppPaths
      const layerScope = yield* Effect.scope
      const connection = yield* Ref.make<NotificationConnection | null>(null)
      const connectLock = yield* Semaphore.make(1)

      // The finalizer lands in the layer scope, so the cached connection is closed exactly once when the layer is torn down.
      const connect = Effect.acquireRelease(
        Effect.gen(function* acquireConnection() {
          const busAddress = yield* sessionBusAddress
          if (busAddress === null) {
            return yield* new DesktopNotificationError({
              message: "no wayland session bus address",
            })
          }
          const bus = dbus.sessionBus({ busAddress })
          bus.on("error", () => {
            // An unreachable session bus must not crash the daemon through an unhandled emitter error; the calls below fail and the layer stays silent.
          })
          const proxy = yield* Effect.tryPromise({
            try: () => bus.getProxyObject(notificationsName, notificationsPath),
            catch: (cause: unknown) =>
              new DesktopNotificationError({
                message: "could not reach the notification service",
                cause,
              }),
          }).pipe(
            Effect.map((object) =>
              object.getInterface<NotificationsInterface>(notificationsInterface),
            ),
            // A failed acquisition never registers the finalizer, so this attempt must close the bus itself.
            Effect.onError(() => disconnect(bus)),
          )
          return { bus, proxy }
        }),
        (connected) => disconnect(connected.bus),
        { interruptible: true },
      )

      const openConnection = connectLock.withPermits(1)(
        Effect.gen(function* reuseOrOpenConnection() {
          const current = yield* Ref.get(connection)
          if (current !== null) {
            return current
          }
          const opened = yield* connect.pipe(Scope.provide(layerScope))
          yield* Ref.set(connection, opened)
          return opened
        }),
      )

      const notify = Effect.fn("DesktopNotifications.notify")(function* sendNotification(
        notification: DesktopNotification,
      ) {
        const opened = yield* openConnection.pipe(Effect.option)
        if (Option.isNone(opened)) {
          yield* Effect.logDebug("no desktop notification service on the session bus")
          return
        }
        yield* Effect.tryPromise({
          try: () =>
            opened.value.proxy.Notify(
              paths.appName,
              0,
              "",
              notification.title,
              notification.message,
              [],
              {},
              -1,
            ),
          catch: (cause: unknown) =>
            new DesktopNotificationError({
              message: "could not send a desktop notification",
              cause,
            }),
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
