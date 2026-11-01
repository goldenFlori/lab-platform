CREATE TABLE `course_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`course_id` text NOT NULL,
	`token` text NOT NULL,
	`solutions` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`,`org_id`) REFERENCES `courses`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_shares_token_unique` ON `course_shares` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `course_shares_course_unique` ON `course_shares` (`org_id`,`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `course_shares_id_org_unique` ON `course_shares` (`id`,`org_id`);--> statement-breakpoint
ALTER TABLE `courses` ADD `copied_from_course_id` text;--> statement-breakpoint
ALTER TABLE `courses` ADD `copied_from_title` text;--> statement-breakpoint
ALTER TABLE `courses` ADD `copied_from_institution` text;--> statement-breakpoint
CREATE INDEX `courses_copied_from_idx` ON `courses` (`copied_from_course_id`);