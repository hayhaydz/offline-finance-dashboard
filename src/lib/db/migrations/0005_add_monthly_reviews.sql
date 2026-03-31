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
CREATE INDEX `idx_monthly_reviews_user_year_month` ON `monthly_reviews` (`user_id`,`year_month`);