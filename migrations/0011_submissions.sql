CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`notebook_id` text NOT NULL,
	`group_id` text NOT NULL,
	`due_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notebook_id`,`org_id`) REFERENCES `notebooks`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`,`org_id`) REFERENCES `groups`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignments_notebook_group_unique` ON `assignments` (`org_id`,`notebook_id`,`group_id`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`notebook_id` text NOT NULL,
	`user_id` text NOT NULL,
	`code` text NOT NULL,
	`solved` text NOT NULL,
	`attempts` integer NOT NULL,
	`submitted_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notebook_id`,`org_id`) REFERENCES `notebooks`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_notebook_user_unique` ON `submissions` (`org_id`,`notebook_id`,`user_id`);