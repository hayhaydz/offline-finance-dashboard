DROP TABLE `backup_codes`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `totp_secret`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `totp_secret_iv`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `mfa_setup_token`;