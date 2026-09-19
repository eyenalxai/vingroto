CREATE INDEX `message_body_fetched_at_index` ON `message` (`body_fetched_at`);--> statement-breakpoint
CREATE INDEX `outbox_state_send_at_index` ON `outbox` (`state`,`send_at`);