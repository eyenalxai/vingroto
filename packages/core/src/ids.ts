import * as Schema from "effect/Schema"

const AccountId = Schema.NonEmptyString.pipe(Schema.brand("@vingroto/AccountId"))

type AccountId = typeof AccountId.Type

const MailboxId = Schema.Int.check(Schema.isGreaterThan(0)).pipe(
  Schema.brand("@vingroto/MailboxId"),
)

type MailboxId = typeof MailboxId.Type

const MessageId = Schema.Int.check(Schema.isGreaterThan(0)).pipe(
  Schema.brand("@vingroto/MessageId"),
)

type MessageId = typeof MessageId.Type

// Why: zero is the persisted "no UID watermark" sentinel for a mailbox that was synced before without one.
const Uid = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(Schema.brand("@vingroto/Uid"))

type Uid = typeof Uid.Type

const OutboxId = Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand("@vingroto/OutboxId"))

type OutboxId = typeof OutboxId.Type

const DraftId = Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand("@vingroto/DraftId"))

type DraftId = typeof DraftId.Type

export { AccountId, DraftId, MailboxId, MessageId, OutboxId, Uid }
