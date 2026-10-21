-- Dedupe (user, month) duplicates BEFORE creating the unique indexes —
-- the seed-wipe bug let re-seeds insert duplicate monthly_reviews rows
-- (data-layer-integrity task 5.1). Keeps the LATEST row (max id) per key.
DELETE FROM `monthly_reviews`
WHERE `id` NOT IN (
	SELECT MAX(`id`) FROM `monthly_reviews` GROUP BY `user_id`, `year_month`
);--> statement-breakpoint
DELETE FROM `budget_months`
WHERE `id` NOT IN (
	SELECT MAX(`id`) FROM `budget_months` GROUP BY `user_id`, `month`
);--> statement-breakpoint
DROP INDEX `idx_snapshots_slug`;--> statement-breakpoint
DROP INDEX `idx_budget_months_user_month`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_budget_months_user_month` ON `budget_months` (`user_id`,`month`);--> statement-breakpoint
DROP INDEX `idx_monthly_reviews_user_year_month`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_monthly_reviews_user_year_month` ON `monthly_reviews` (`user_id`,`year_month`);