CREATE TABLE `account_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`account_id` integer NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_notes_slug_unique` ON `account_notes` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_account_notes_account_created` ON `account_notes` (`account_id`,`created_at`);