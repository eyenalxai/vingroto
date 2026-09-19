import { BunServices } from "@effect/platform-bun"
import { AppPaths } from "@vingroto/core/app-paths"
import { LoggingLayer } from "@vingroto/core/logging"
import * as Layer from "effect/Layer"

import { Accounts } from "@/lib/accounts"
import { ApiServer } from "@/lib/api/runtime"
import { Credential } from "@/lib/credential/service"
import { Database } from "@/lib/db/database"
import { Drafts } from "@/lib/drafts"
import { ServerEvents } from "@/lib/events"
import { ServerLifecycle } from "@/lib/lifecycle"
import { MailActions } from "@/lib/mail/actions"
import { Discovery } from "@/lib/mail/autoconfig"
import { MessageBodies } from "@/lib/mail/bodies"
import { Imap } from "@/lib/mail/imap"
import { Mailer } from "@/lib/mail/mailer"
import { MessagePrefetch } from "@/lib/mail/prefetch"
import { Search } from "@/lib/mail/search"
import { SentCopies } from "@/lib/mail/sent"
import { SyncEngine } from "@/lib/mail/sync"
import { Messages } from "@/lib/messages"
import { DesktopNotifications } from "@/lib/notify/desktop"
import { NewMailNotifier } from "@/lib/notify/new-mail"
import { Outbox } from "@/lib/outbox"
import { Scheduler } from "@/lib/scheduler"
import { Settings } from "@/lib/settings"

const PathsLayer = AppPaths.layer

// BunServices stays exposed: every subgraph below needs FileSystem, ChildProcessSpawner, Path, or Crypto.
const ServicesLayer = Layer.mergeAll(
  PathsLayer,
  Credential.layer.pipe(Layer.provide(PathsLayer)),
).pipe(Layer.provideMerge(BunServices.layer))

const LifecycleLayer = ServerLifecycle.layer.pipe(Layer.provide(ServicesLayer))

// The logger is built alongside the services so anything below it logs to the file and stderr.
const ServerLoggingLayer = LoggingLayer.server.pipe(Layer.provide(ServicesLayer))

const DesktopLayer = DesktopNotifications.layer.pipe(Layer.provide(ServicesLayer))

const InfraLayer = Layer.mergeAll(
  ServicesLayer,
  LifecycleLayer,
  ServerLoggingLayer,
  ServerEvents.layer,
  DesktopLayer,
)

const CoreLayer = Layer.mergeAll(Database.layer, Imap.layer).pipe(Layer.provideMerge(InfraLayer))

const NotifyLayer = NewMailNotifier.layer.pipe(Layer.provide(CoreLayer))

const SyncLayer = Layer.mergeAll(
  SyncEngine.layer.pipe(Layer.provide(NotifyLayer)),
  MessagePrefetch.layer,
).pipe(Layer.provide(CoreLayer))

const SchedulerLayer = Scheduler.layer.pipe(Layer.provide(Layer.mergeAll(SyncLayer, CoreLayer)))

const MailerLayer = Mailer.layer.pipe(Layer.provide(CoreLayer))

const SentCopiesLayer = SentCopies.layer.pipe(Layer.provide(Layer.mergeAll(MailerLayer, CoreLayer)))

const OutboxLayer = Outbox.layer.pipe(
  Layer.provide(Layer.mergeAll(SentCopiesLayer, MailerLayer, CoreLayer)),
)

const DraftsLayer = Drafts.layer.pipe(Layer.provide(CoreLayer))

const AccountsLayer = Accounts.layer.pipe(Layer.provide(Layer.mergeAll(SchedulerLayer, CoreLayer)))

const MailActionsLayer = MailActions.layer.pipe(Layer.provide(CoreLayer))

const MessagesLayer = Messages.layer.pipe(Layer.provide(MailActionsLayer), Layer.provide(CoreLayer))

const AppLayer = Layer.mergeAll(
  CoreLayer,
  SyncLayer,
  SchedulerLayer,
  MailerLayer,
  SentCopiesLayer,
  OutboxLayer,
  DraftsLayer,
  Discovery.layer,
  MailActionsLayer,
  MessagesLayer,
  MessageBodies.layer.pipe(Layer.provide(CoreLayer)),
  AccountsLayer,
  Settings.layer.pipe(Layer.provide(CoreLayer)),
  Search.layer.pipe(Layer.provide(CoreLayer)),
)

const ServerRuntime = ApiServer.pipe(Layer.provide(AppLayer))

export { ServerRuntime }
