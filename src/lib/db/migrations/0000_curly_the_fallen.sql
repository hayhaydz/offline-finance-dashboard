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
CREATE INDEX `idx_account_notes_account_created` ON `account_notes` (`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `account_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`account_id` integer NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`category_id` integer,
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
	`opened_at` integer,
	`closed_at` integer,
	`maturity_date` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`minimumPaymentType` text DEFAULT 'flat' NOT NULL,
	`minimumPaymentFlat` integer DEFAULT 0 NOT NULL,
	`minimumPaymentPercentage` integer DEFAULT 0 NOT NULL,
	`creditLimit` integer,
	`originalPrincipal` integer,
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
CREATE INDEX `idx_backup_codes_user_id_used` ON `backup_codes` (`user_id`,`used`);--> statement-breakpoint
CREATE TABLE `budget_months` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`month` text NOT NULL,
	`total_target_in_cents` integer DEFAULT 0 NOT NULL,
	`excluded_category_ids` text DEFAULT '[]' NOT NULL,
	`excluded_account_ids` text DEFAULT '[]' NOT NULL,
	`category_targets` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_budget_months_user_month` ON `budget_months` (`user_id`,`month`);--> statement-breakpoint
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
CREATE INDEX `idx_goal_milestones_reached_at` ON `goal_milestones` (`reached_at`);--> statement-breakpoint
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
	`goal_type` text DEFAULT 'savings' NOT NULL,
	`linked_account_id` integer,
	`starting_balance_in_cents` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
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
CREATE INDEX `idx_login_attempts_last_attempt` ON `login_attempts` (`last_attempt`);--> statement-breakpoint
CREATE INDEX `idx_login_attempts_locked_until` ON `login_attempts` (`locked_until`);--> statement-breakpoint
CREATE TABLE `monthly_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`user_id` integer NOT NULL,
	`year_month` text NOT NULL,
	`completed_items` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_reviews_slug_unique` ON `monthly_reviews` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_monthly_reviews_user_year_month` ON `monthly_reviews` (`user_id`,`year_month`);--> statement-breakpoint
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
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE `spending_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`key` text NOT NULL,
	`colour` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spending_categories_slug_unique` ON `spending_categories` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_spending_categories_user_key` ON `spending_categories` (`user_id`,`key`);--> statement-breakpoint
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
	`inactivity_timeout` integer DEFAULT 5,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);