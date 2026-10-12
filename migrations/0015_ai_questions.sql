CREATE TABLE `ai_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`course_id` text NOT NULL,
	`notebook_id` text NOT NULL,
	`user_id` text NOT NULL,
	`cell` integer NOT NULL,
	`code` text NOT NULL,
	`error` text NOT NULL,
	`answer` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`,`org_id`) REFERENCES `courses`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notebook_id`,`org_id`) REFERENCES `notebooks`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_questions_course_idx` ON `ai_questions` (`org_id`,`course_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_questions_created_idx` ON `ai_questions` (`created_at`);--> statement-breakpoint
ALTER TABLE `exercises` ADD `ai_mode` text DEFAULT 'hints' NOT NULL;