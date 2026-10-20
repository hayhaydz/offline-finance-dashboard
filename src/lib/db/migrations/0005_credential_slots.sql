CREATE TABLE `credential_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slot_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`kind` text NOT NULL,
	`wrapped_key` text NOT NULL,
	`iv` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credential_slots_slot_id_unique` ON `credential_slots` (`slot_id`);--> statement-breakpoint
CREATE INDEX `idx_credential_slots_user_kind` ON `credential_slots` (`user_id`,`kind`,`revoked_at`);