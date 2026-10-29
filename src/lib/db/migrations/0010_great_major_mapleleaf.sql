ALTER TABLE `account_transactions` ADD `payoffPlan` text;--> statement-breakpoint
ALTER TABLE `account_transactions` ADD `planned_clear_by` integer;--> statement-breakpoint
ALTER TABLE `account_transactions` ADD `allocates_to_id` integer;--> statement-breakpoint
ALTER TABLE `accounts` ADD `creditMode` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `promo_ends_at` integer;--> statement-breakpoint
ALTER TABLE `accounts` ADD `revertAprBps` integer;