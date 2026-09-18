CREATE TABLE `attachment` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`message_id` integer NOT NULL,
	`part` text,
	`filename` text,
	`mime_type` text,
	`size` integer,
	`content_id` text,
	`inline` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_attachment_message_id_message_id_fk` FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `mailbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`account_id` text NOT NULL,
	`path` text NOT NULL,
	`name` text NOT NULL,
	`delimiter` text NOT NULL,
	`special_use` text,
	`selectable` integer NOT NULL,
	`uid_validity` integer,
	`last_seen_uid` integer NOT NULL,
	`synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `message_body` (
	`message_id` integer PRIMARY KEY,
	`text` text,
	`html` text,
	`fetched_at` integer NOT NULL,
	CONSTRAINT `fk_message_body_message_id_message_id_fk` FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `message` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`account_id` text NOT NULL,
	`mailbox_id` integer NOT NULL,
	`uid` integer NOT NULL,
	`message_id` text,
	`in_reply_to` text,
	`references` text,
	`subject` text,
	`from_name` text,
	`from_address` text,
	`to` text,
	`cc` text,
	`date` integer,
	`size` integer,
	`seen` integer NOT NULL,
	`answered` integer NOT NULL,
	`flagged` integer NOT NULL,
	`draft` integer NOT NULL,
	`keywords` text,
	`snippet` text,
	`has_attachments` integer NOT NULL,
	`body_fetched_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_message_mailbox_id_mailbox_id_fk` FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `attachment_message_id_index` ON `attachment` (`message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mailbox_account_id_path_unique` ON `mailbox` (`account_id`,`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `message_mailbox_id_uid_unique` ON `message` (`mailbox_id`,`uid`);--> statement-breakpoint
CREATE INDEX `message_account_id_date_index` ON `message` (`account_id`,`date`);