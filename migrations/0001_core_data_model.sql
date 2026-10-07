CREATE TABLE `course_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`title` text NOT NULL,
	`owner_user_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_templates_id_org_unique` ON `course_templates` (`id`,`org_id`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`template_id` text,
	`title` text NOT NULL,
	`academic_year` text NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`,`org_id`) REFERENCES `course_templates`(`id`,`org_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `courses_org_idx` ON `courses` (`org_id`);--> statement-breakpoint
CREATE INDEX `courses_template_idx` ON `courses` (`template_id`,`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `courses_id_org_unique` ON `courses` (`id`,`org_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`course_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`,`org_id`) REFERENCES `courses`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `groups_course_idx` ON `groups` (`course_id`,`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `groups_id_org_unique` ON `groups` (`id`,`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `groups_course_name_unique` ON `groups` (`org_id`,`course_id`,`name`);--> statement-breakpoint
CREATE TABLE `lab_access` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`lab_id` text NOT NULL,
	`group_id` text,
	`visible_from` integer,
	`visible_until` integer,
	`solutions_from` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lab_id`,`org_id`) REFERENCES `labs`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`,`org_id`) REFERENCES `groups`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lab_access_lab_group_unique` ON `lab_access` (`org_id`,`lab_id`,`group_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lab_access_lab_course_unique` ON `lab_access` (`org_id`,`lab_id`) WHERE "lab_access"."group_id" is null;--> statement-breakpoint
CREATE INDEX `lab_access_group_idx` ON `lab_access` (`group_id`,`org_id`);--> statement-breakpoint
CREATE TABLE `labs` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`course_id` text NOT NULL,
	`n` integer NOT NULL,
	`title` text NOT NULL,
	`week` integer,
	`summary` text,
	`position` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`,`org_id`) REFERENCES `courses`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `labs_course_idx` ON `labs` (`course_id`,`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `labs_id_org_unique` ON `labs` (`id`,`org_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text,
	`group_id` text,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`,`org_id`) REFERENCES `courses`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`,`org_id`) REFERENCES `groups`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "memberships_one_scope" CHECK("memberships"."course_id" is null or "memberships"."group_id" is null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_org_unique` ON `memberships` (`user_id`,`org_id`) WHERE "memberships"."course_id" is null and "memberships"."group_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_course_unique` ON `memberships` (`user_id`,`org_id`,`course_id`) WHERE "memberships"."course_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_group_unique` ON `memberships` (`user_id`,`org_id`,`group_id`) WHERE "memberships"."group_id" is not null;--> statement-breakpoint
CREATE INDEX `memberships_org_idx` ON `memberships` (`org_id`);--> statement-breakpoint
CREATE INDEX `memberships_course_idx` ON `memberships` (`course_id`,`org_id`);--> statement-breakpoint
CREATE INDEX `memberships_group_idx` ON `memberships` (`group_id`,`org_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text,
	`password_hash` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);