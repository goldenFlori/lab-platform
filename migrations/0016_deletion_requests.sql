CREATE TABLE `deletion_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`handled_at` integer,
	`handled_by` text,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`handled_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deletion_requests_open_unique` ON `deletion_requests` (`org_id`,`user_id`) WHERE "deletion_requests"."handled_at" is null;--> statement-breakpoint
CREATE INDEX `deletion_requests_org_idx` ON `deletion_requests` (`org_id`,`created_at`);