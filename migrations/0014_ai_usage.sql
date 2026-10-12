CREATE TABLE `ai_usage` (
	`org_id` text NOT NULL,
	`course_id` text NOT NULL,
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	`neurons` real DEFAULT 0 NOT NULL,
	PRIMARY KEY(`org_id`, `course_id`, `user_id`, `day`),
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`,`org_id`) REFERENCES `courses`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_usage_org_day_idx` ON `ai_usage` (`org_id`,`day`);--> statement-breakpoint
CREATE INDEX `ai_usage_user_day_idx` ON `ai_usage` (`org_id`,`user_id`,`day`);--> statement-breakpoint
ALTER TABLE `courses` ADD `ai_enabled` integer DEFAULT false NOT NULL;