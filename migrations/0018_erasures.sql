CREATE TABLE `erasures` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`requested_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`erased_by` text,
	`account_deleted` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`erased_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `erasures_org_idx` ON `erasures` (`org_id`,`created_at`);