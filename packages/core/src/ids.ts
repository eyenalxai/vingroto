import * as Schema from "effect/Schema"

const AccountId = Schema.NonEmptyString.pipe(Schema.brand("@vingroto/AccountId"))

type AccountId = Schema.Schema.Type<typeof AccountId>

const MailboxId = Schema.Int.check(Schema.isGreaterThan(0)).pipe(
  Schema.brand("@vingroto/MailboxId"),
)

type MailboxId = Schema.Schema.Type<typeof MailboxId>

const MessageId = Schema.Int.check(Schema.isGreaterThan(0)).pipe(
  Schema.brand("@vingroto/MessageId"),
)

type MessageId = Schema.Schema.Type<typeof MessageId>

// Why: zero is the persisted "no UID watermark" sentinel for a mailbox that was synced before without one.
const Uid = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(Schema.brand("@vingroto/Uid"))

type Uid = Schema.Schema.Type<typeof Uid>

const OutboxId = Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand("@vingroto/OutboxId"))

type OutboxId = Schema.Schema.Type<typeof OutboxId>

const DraftId = Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand("@vingroto/DraftId"))

type DraftId = Schema.Schema.Type<typeof DraftId>

export { AccountId, DraftId, MailboxId, MessageId, OutboxId, Uid }
