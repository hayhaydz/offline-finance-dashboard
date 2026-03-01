CREATE INDEX IF NOT EXISTS `idx_sessions_user_last_activity` ON `sessions` (`user_id`, `last_activity`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_accounts_user_closed` ON `accounts` (`user_id`, `closed_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_accounts_user_excluded_closed` ON `accounts` (`user_id`, `excluded_from_net_worth`, `closed_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_account_balances_account_asof` ON `account_balances` (`account_id`, `as_of_date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_goals_user_deleted_sort` ON `goals` (`user_id`, `deleted_at`, `sort_order`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_goal_allocations_goal` ON `goal_allocations` (`goal_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_goal_allocations_account` ON `goal_allocations` (`account_id`);
