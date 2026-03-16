CREATE TABLE `account_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`account_id` integer NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`category` text,
	`description` text,
	`transaction_date` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_transactions_slug_unique` ON `account_transactions` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_account_transactions_account_date` ON `account_transactions` (`account_id`,`transaction_date`);--> statement-breakpoint
CREATE INDEX `idx_account_transactions_type` ON `account_transactions` (`type`);--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`institution` text,
	`type` text NOT NULL,
	`tax_wrapper` text DEFAULT 'none' NOT NULL,
	`category` text NOT NULL,
	`liquidity` text,
	`excluded_from_net_worth` integer DEFAULT false NOT NULL,
	`closed_at` integer,
	`maturity_date` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_slug_unique` ON `accounts` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_accounts_user_closed` ON `accounts` (`user_id`,`closed_at`);--> statement-breakpoint
CREATE INDEX `idx_accounts_user_excluded_closed` ON `accounts` (`user_id`,`excluded_from_net_worth`,`closed_at`);--> statement-breakpoint
CREATE TABLE `backup_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`code` text NOT NULL,
	`used` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `goal_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`goal_id` integer NOT NULL,
	`account_id` integer,
	`amount` integer NOT NULL,
	`type` text NOT NULL,
	`allocation_date` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_goal_allocations_goal` ON `goal_allocations` (`goal_id`);--> statement-breakpoint
CREATE INDEX `idx_goal_allocations_account` ON `goal_allocations` (`account_id`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`target_amount_in_cents` integer NOT NULL,
	`current_allocation` integer DEFAULT 0 NOT NULL,
	`target_date` integer,
	`is_emergency_fund` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `goals_slug_unique` ON `goals` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_goals_user_deleted_sort` ON `goals` (`user_id`,`deleted_at`,`sort_order`);--> statement-breakpoint
CREATE TABLE `interest_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`rate` integer NOT NULL,
	`effective_from` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_interest_rates_account_effective` ON `interest_rates` (`account_id`,`effective_from`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`username` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`last_attempt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`locked_until` integer
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_activity` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user_last_activity` ON `sessions` (`user_id`,`last_activity`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`user_id` integer NOT NULL,
	`snapshot_date` text NOT NULL,
	`net_worth_in_cents` integer NOT NULL,
	`total_assets_in_cents` integer NOT NULL,
	`total_liabilities_in_cents` integer NOT NULL,
	`total_allocated_in_cents` integer DEFAULT 0 NOT NULL,
	`accounts_breakdown` text,
	`interest_breakdown` text,
	`goals_breakdown` text,
	`isa_breakdown` text,
	`interest_breakdown_detail` text,
	`isa_and_interest_breakdown` text,
	`notes` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_slug_unique` ON `snapshots` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_snapshots_user_date` ON `snapshots` (`user_id`,`snapshot_date`);--> statement-breakpoint
CREATE INDEX `idx_snapshots_slug` ON `snapshots` (`slug`);--> statement-breakpoint
CREATE TABLE `system_metadata` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`totp_secret` text NOT NULL,
	`totp_secret_iv` text NOT NULL,
	`password_salt` text NOT NULL,
	`mfa_setup_token` text,
	`tax_band` text DEFAULT 'basic' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);