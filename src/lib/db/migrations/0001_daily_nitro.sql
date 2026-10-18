CREATE TABLE `budget_config_amendments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`budget_month_id` integer NOT NULL,
	`field` text NOT NULL,
	`old_value` text NOT NULL,
	`new_value` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`budget_month_id`) REFERENCES `budget_months`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_budget_amendments_month_created` ON `budget_config_amendments` (`budget_month_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `budget_months` ADD `excluded_types` text DEFAULT '[]' NOT NULL;