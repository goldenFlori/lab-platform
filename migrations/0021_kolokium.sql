CREATE TABLE `kolokium_starts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`notebook_id` text NOT NULL,
	`user_id` text NOT NULL,
	`started_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notebook_id`,`org_id`) REFERENCES `notebooks`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kolokium_starts_unique` ON `kolokium_starts` (`org_id`,`notebook_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `assignments` ADD `opens_at` integer;--> statement-breakpoint
ALTER TABLE `assignments` ADD `minutes` integer;