CREATE TABLE `attendance_marks` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`,`org_id`) REFERENCES `attendance_sessions`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_marks_unique` ON `attendance_marks` (`org_id`,`session_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `attendance_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`group_id` text NOT NULL,
	`day` text NOT NULL,
	`lab_id` text,
	`label` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`,`org_id`) REFERENCES `groups`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attendance_sessions_group_idx` ON `attendance_sessions` (`org_id`,`group_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_sessions_id_org_unique` ON `attendance_sessions` (`id`,`org_id`);