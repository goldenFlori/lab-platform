CREATE TABLE `trace_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`notebook_id` text NOT NULL,
	`cell` integer NOT NULL,
	`user_id` text NOT NULL,
	`rows` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notebook_id`,`org_id`) REFERENCES `notebooks`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trace_answers_unique` ON `trace_answers` (`org_id`,`notebook_id`,`cell`,`user_id`);--> statement-breakpoint
ALTER TABLE `grades` ADD `traces` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `submissions` ADD `traces` text DEFAULT '[]' NOT NULL;