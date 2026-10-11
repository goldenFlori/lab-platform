CREATE TABLE `exercise_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`notebook_id` text NOT NULL,
	`cell` integer NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notebook_id`,`org_id`) REFERENCES `notebooks`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_completions_unique` ON `exercise_completions` (`org_id`,`notebook_id`,`cell`,`user_id`);--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`notebook_id` text NOT NULL,
	`cell` integer NOT NULL,
	`title` text NOT NULL,
	`test` text,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notebook_id`,`org_id`) REFERENCES `notebooks`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercises_notebook_cell_unique` ON `exercises` (`org_id`,`notebook_id`,`cell`);