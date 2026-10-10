CREATE TABLE `lab_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`lab_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`day` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lab_id`,`org_id`) REFERENCES `labs`(`id`,`org_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lab_activity_unique` ON `lab_activity` (`org_id`,`lab_id`,`user_id`,`kind`,`day`);