-- Add maturityDate column to accounts table for fixed-term accounts/bonds
ALTER TABLE `accounts` ADD COLUMN `maturity_date` integer;
--> statement-breakpoint

-- Create account_transactions table for tracking individual money movements
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
CREATE UNIQUE INDEX `account_transactions_slug_unique` ON `account_transactions` (`slug`);
--> statement-breakpoint
CREATE INDEX `idx_account_transactions_account_date` ON `account_transactions` (`account_id`, `transaction_date`);
--> statement-breakpoint
CREATE INDEX `idx_account_transactions_type` ON `account_transactions` (`type`);
--> statement-breakpoint

-- Create interest_rates table for tracking historical and future interest rates
CREATE TABLE `interest_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`rate` integer NOT NULL,
	`effective_from` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_interest_rates_account_effective` ON `interest_rates` (`account_id`, `effective_from`);
