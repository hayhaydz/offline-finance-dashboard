CREATE TABLE `import_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`user_id` integer NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`recovery` integer DEFAULT false NOT NULL,
	`payload` text NOT NULL,
	`rows_total` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`result_counts` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_jobs_slug_unique` ON `import_jobs` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_import_jobs_user` ON `import_jobs` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_import_jobs_status` ON `import_jobs` (`status`,`id`);