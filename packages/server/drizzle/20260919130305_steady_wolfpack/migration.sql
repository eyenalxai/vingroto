CREATE TABLE `draft` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`account_id` text NOT NULL,
	`to` text NOT NULL,
	`cc` text DEFAULT '[]' NOT NULL,
	`bcc` text DEFAULT '[]' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`in_reply_to` text,
	`references` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`account_id` text NOT NULL,
	`to` text NOT NULL,
	`cc` text DEFAULT '[]' NOT NULL,
	`bcc` text DEFAULT '[]' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`in_reply_to` text,
	`references` text DEFAULT '[]' NOT NULL,
	`send_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
