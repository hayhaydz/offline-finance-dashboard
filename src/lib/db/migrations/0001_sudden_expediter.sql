ALTER TABLE `accounts` ADD `minimumPaymentType` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `minimumPaymentFlat` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `minimumPaymentPercentage` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `creditLimit` integer;--> statement-breakpoint
ALTER TABLE `accounts` ADD `originalPrincipal` integer;