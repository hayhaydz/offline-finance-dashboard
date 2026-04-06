CREATE TABLE `goal_milestones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`goal_id` integer NOT NULL,
	`label` text NOT NULL,
	`threshold_in_cents` integer NOT NULL,
	`reached_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_goal_milestones_goal` ON `goal_milestones` (`goal_id`);--> statement-breakpoint
ALTER TABLE `goals` ADD `goal_type` text DEFAULT 'savings' NOT NULL;--> statement-breakpoint
ALTER TABLE `goals` ADD `linked_account_id` integer REFERENCES accounts(id);--> statement-breakpoint
ALTER TABLE `goals` ADD `starting_balance_in_cents` integer;