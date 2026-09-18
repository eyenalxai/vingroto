import { HttpApi, OpenApi } from "effect/unstable/httpapi"

import { AccountGroup } from "./accounts"
import { Authorization } from "./authorization"
import { EventGroup } from "./events"
import { MailboxGroup } from "./mailboxes"
import { MessageGroup } from "./messages"
import { ServerGroup } from "./server"
import { SyncGroup } from "./sync"

const Api = HttpApi.make("vingroto")
  .add(ServerGroup, MailboxGroup, MessageGroup, AccountGroup, SyncGroup, EventGroup)
  .middleware(Authorization)
  .annotateMerge(
    OpenApi.annotations({
      title: "vingroto",
      version: "1",
      description: "The vingroto mail daemon API.",
    }),
  )

export { Api }
