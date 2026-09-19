import * as Schema from "effect/Schema"

const AccountId = Schema.String.pipe(Schema.brand("AccountId"))

type AccountId = Schema.Schema.Type<typeof AccountId>

const MailboxId = Schema.Int.pipe(Schema.brand("MailboxId"))

type MailboxId = Schema.Schema.Type<typeof MailboxId>

const MessageId = Schema.Int.pipe(Schema.brand("MessageId"))

type MessageId = Schema.Schema.Type<typeof MessageId>

const Uid = Schema.Int.pipe(Schema.brand("Uid"))

type Uid = Schema.Schema.Type<typeof Uid>

const OutboxId = Schema.Int.pipe(Schema.brand("OutboxId"))

type OutboxId = Schema.Schema.Type<typeof OutboxId>

const DraftId = Schema.Int.pipe(Schema.brand("DraftId"))

type DraftId = Schema.Schema.Type<typeof DraftId>

export { AccountId, DraftId, MailboxId, MessageId, OutboxId, Uid }
