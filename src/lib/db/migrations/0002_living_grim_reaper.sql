PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
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
	`minimumPaymentType` text DEFAULT 'flat' NOT NULL,
	`minimumPaymentFlat` integer DEFAULT 0 NOT NULL,
	`minimumPaymentPercentage` integer DEFAULT 0 NOT NULL,
	`creditLimit` integer,
	`originalPrincipal` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "slug", "user_id", "name", "institution", "type", "tax_wrapper", "category", "liquidity", "excluded_from_net_worth", "closed_at", "maturity_date", "created_at", "updated_at", "minimumPaymentType", "minimumPaymentFlat", "minimumPaymentPercentage", "creditLimit", "originalPrincipal") SELECT "id", "slug", "user_id", "name", "institution", "type", "tax_wrapper", "category", "liquidity", "excluded_from_net_worth", "closed_at", "maturity_date", "created_at", "updated_at", "minimumPaymentType", "minimumPaymentFlat", "minimumPaymentPercentage", "creditLimit", "originalPrincipal" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_slug_unique` ON `accounts` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_accounts_user_closed` ON `accounts` (`user_id`,`closed_at`);--> statement-breakpoint
CREATE INDEX `idx_accounts_user_excluded_closed` ON `accounts` (`user_id`,`excluded_from_net_worth`,`closed_at`);