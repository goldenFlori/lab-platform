CREATE TABLE `survey_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`survey_id` text NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`survey_id`,`org_id`) REFERENCES `surveys`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
) WITHOUT ROWID;
--> statement-breakpoint
CREATE INDEX `survey_comments_survey_idx` ON `survey_comments` (`org_id`,`survey_id`);--> statement-breakpoint
CREATE TABLE `survey_ratings` (
	`org_id` text NOT NULL,
	`survey_id` text NOT NULL,
	`question` text NOT NULL,
	`score` integer NOT NULL,
	`n` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`org_id`, `survey_id`, `question`, `score`),
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`survey_id`,`org_id`) REFERENCES `surveys`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `survey_respondents` (
	`org_id` text NOT NULL,
	`survey_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`org_id`, `survey_id`, `user_id`),
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`survey_id`,`org_id`) REFERENCES `surveys`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
) WITHOUT ROWID;
--> statement-breakpoint
CREATE TABLE `surveys` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`course_id` text NOT NULL,
	`closes_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`,`org_id`) REFERENCES `courses`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `surveys_course_unique` ON `surveys` (`org_id`,`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `surveys_id_org_unique` ON `surveys` (`id`,`org_id`);